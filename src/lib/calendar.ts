/**
 * Optional calendar integration: block out the daily review window as a recurring
 * event the user can see/manage in their own calendar. The created event id is
 * persisted so the entry can be updated when the schedule changes, or removed.
 * No-op on web.
 */
import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar';
import { getSetting, setSetting } from '../db/database';

const EVENT_KEY = 'calendar.unlockEventId';
const TITLE = 'Capsule — review window';

async function resolveWritableCalendarId(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== 'granted') return null;
  if (Platform.OS === 'ios') {
    const def = await Calendar.getDefaultCalendarAsync();
    return def?.id ?? null;
  }
  const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  return cals.find(c => c.allowsModifications)?.id ?? null;
}

function nextStartEnd(hour: number, minute: number, durationMinutes: number): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  if (start.getTime() <= now.getTime()) start.setDate(start.getDate() + 1);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  return { start, end };
}

export async function isCalendarLinked(): Promise<boolean> {
  const id = await getSetting(EVENT_KEY);
  return !!id;
}

/** Create the recurring daily "review window" event. Returns false if permission denied. */
export async function addUnlockToCalendar(hour: number, minute: number, durationMinutes: number): Promise<boolean> {
  const calId = await resolveWritableCalendarId();
  if (!calId) return false;
  const { start, end } = nextStartEnd(hour, minute, durationMinutes);
  // Create the NEW event first, then delete any prior one — so a create failure
  // leaves the existing event + id intact rather than orphaning/losing it.
  const eventId = await Calendar.createEventAsync(calId, {
    title: TITLE,
    notes: 'Your Capsule box opens for review during this window.',
    startDate: start,
    endDate: end,
    recurrenceRule: { frequency: Calendar.Frequency.DAILY },
    alarms: [{ relativeOffset: 0 }],
  });
  const prior = await getSetting(EVENT_KEY);
  if (prior && prior !== eventId) {
    try {
      await Calendar.deleteEventAsync(prior, { futureEvents: true });
    } catch {
      // Couldn't remove the old event — roll back the new one so we don't leave
      // two recurring review windows. The prior event + id stay valid.
      try { await Calendar.deleteEventAsync(eventId, { futureEvents: true }); } catch { /* best effort */ }
      return true;
    }
  }
  await setSetting(EVENT_KEY, eventId);
  return true;
}

/** Update the linked event to match the current schedule (no-op if not linked). */
export async function updateUnlockCalendar(hour: number, minute: number, durationMinutes: number): Promise<void> {
  if (Platform.OS === 'web') return;
  const eventId = await getSetting(EVENT_KEY);
  if (!eventId) return;
  const { start, end } = nextStartEnd(hour, minute, durationMinutes);
  try {
    await Calendar.updateEventAsync(eventId, { startDate: start, endDate: end }, { futureEvents: true });
  } catch {
    // Best-effort: a transient failure (e.g. temporarily denied permission) must
    // NOT clear the id, or we'd orphan a still-existing event. Leave it linked;
    // the user can remove it explicitly from Settings.
  }
}

/** Remove the linked recurring event. */
export async function removeUnlockFromCalendar(): Promise<void> {
  if (Platform.OS === 'web') return;
  const eventId = await getSetting(EVENT_KEY);
  if (!eventId) return;
  try {
    await Calendar.deleteEventAsync(eventId, { futureEvents: true });
  } catch {
    /* already gone */
  }
  await setSetting(EVENT_KEY, '');
}
