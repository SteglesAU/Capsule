export function getNextUnlockDate(hour: number, minute: number): Date {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0);

  if (now >= today) {
    // Next unlock is tomorrow
    today.setDate(today.getDate() + 1);
  }

  return today;
}

export function getWindowEndDate(hour: number, minute: number, durationMinutes: number): Date {
  const unlock = new Date();
  unlock.setHours(hour, minute, 0, 0);
  return new Date(unlock.getTime() + durationMinutes * 60 * 1000);
}

export function formatCountdown(targetMs: number): string {
  const diff = Math.max(0, targetMs - Date.now());
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** Whether the device's locale uses a 24-hour clock (best-effort via Intl). */
export function systemUses24(): boolean {
  try {
    const o = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions();
    if (typeof o.hour12 === 'boolean') return !o.hour12;
    if (o.hourCycle) return o.hourCycle === 'h23' || o.hourCycle === 'h24';
  } catch {
    /* fall through */
  }
  return false; // default to 12-hour AM/PM
}

/** Resolve a ClockFormat preference to a concrete 24h boolean. */
export function resolveClock24(fmt: 'system' | '12' | '24'): boolean {
  return fmt === '24' ? true : fmt === '12' ? false : systemUses24();
}

/** Local time display. Keeps midday/midnight unambiguous in either format. */
export function formatTime(hour: number, minute: number, use24 = false): string {
  if (hour === 12 && minute === 0) return 'Midday';
  if (hour === 0 && minute === 0) return 'Midnight';
  const mm = String(minute).padStart(2, '0');
  if (use24) return `${String(hour).padStart(2, '0')}:${mm}`;
  const period = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${mm} ${period}`;
}

export function isWithinReviewWindow(unlockHour: number, unlockMinute: number, windowMinutes: number): boolean {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), unlockHour, unlockMinute, 0);
  const windowEnd = new Date(today.getTime() + windowMinutes * 60 * 1000);

  return now >= today && now < windowEnd;
}

/** True if two epoch-ms timestamps fall on the same local calendar day. */
export function isSameCalendarDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

/** True once today's review window has opened and already closed (a missed window). */
export function wasWindowMissedToday(unlockHour: number, unlockMinute: number, windowMinutes: number): boolean {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), unlockHour, unlockMinute, 0);
  const end = new Date(start.getTime() + windowMinutes * 60 * 1000);
  // Window end is exclusive (isWithinReviewWindow uses now < end), so the exact
  // end instant counts as missed.
  return now.getTime() >= end.getTime();
}
