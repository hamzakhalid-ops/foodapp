/**
 * Local wall-clock parts in the business timezone (ADR-0014 §6). ISO weekday: 1 = Monday … 7 = Sunday.
 */
export function businessClock(
  at: Date,
  timeZone: string,
): { isoWeekday: number; hhmm: string; date: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return {
    isoWeekday: weekdays.indexOf(parts.weekday ?? '') + 1,
    hhmm: `${parts.hour ?? '00'}:${parts.minute ?? '00'}`,
    date: `${parts.year ?? ''}-${parts.month ?? ''}-${parts.day ?? ''}`,
  };
}

/** `YYYY-MM-DD` shifted by whole calendar days. */
export function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** The UTC instant of local midnight starting `date` in `timeZone` (DST-safe). */
export function businessMidnight(date: string, timeZone: string): Date {
  const wall = Date.parse(`${date}T00:00:00Z`);
  const offsetAt = (instant: number) => {
    const clock = businessClock(new Date(instant), timeZone);
    return Date.parse(`${clock.date}T${clock.hhmm}:00Z`) - instant;
  };
  const guess = wall - offsetAt(wall);
  return new Date(wall - offsetAt(guess));
}

/**
 * The most recent fully closed settlement period before `now` (FINANCIAL_SPEC §26): the previous
 * business day, or the previous ISO week (Monday–Sunday), in the business timezone.
 */
export function lastClosedPeriod(
  now: Date,
  frequency: 'DAILY' | 'WEEKLY',
  timeZone: string,
): { start: Date; end: Date } {
  const { date, isoWeekday } = businessClock(now, timeZone);
  const endDate = frequency === 'DAILY' ? date : addDays(date, 1 - isoWeekday);
  const startDate = addDays(endDate, frequency === 'DAILY' ? -1 : -7);
  return {
    start: businessMidnight(startDate, timeZone),
    end: businessMidnight(endDate, timeZone),
  };
}
