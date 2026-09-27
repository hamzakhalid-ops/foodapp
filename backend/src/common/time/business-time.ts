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
