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

export function formatTime(hour: number, minute: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12;
  const m = minute.toString().padStart(2, '0');
  return `${h}:${m} ${period}`;
}

export function isWithinReviewWindow(unlockHour: number, unlockMinute: number, windowMinutes: number): boolean {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), unlockHour, unlockMinute, 0);
  const windowEnd = new Date(today.getTime() + windowMinutes * 60 * 1000);

  return now >= today && now < windowEnd;
}
