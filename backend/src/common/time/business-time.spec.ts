import { businessClock, businessMidnight, lastClosedPeriod } from './business-time';

describe('businessClock', () => {
  it('converts UTC to the business timezone (Asia/Karachi = UTC+5)', () => {
    // 2026-09-27 is a Sunday; 20:30 UTC = Monday 01:30 in Karachi.
    expect(businessClock(new Date('2026-09-27T20:30:00Z'), 'Asia/Karachi')).toEqual({
      isoWeekday: 1,
      hhmm: '01:30',
      date: '2026-09-28',
    });
    expect(businessClock(new Date('2026-09-27T06:05:00Z'), 'Asia/Karachi')).toMatchObject({
      isoWeekday: 7,
      hhmm: '11:05',
    });
  });
});

describe('settlement periods', () => {
  it('finds local midnight as a UTC instant, including across DST changes', () => {
    expect(businessMidnight('2026-09-28', 'Asia/Karachi').toISOString()).toBe(
      '2026-09-27T19:00:00.000Z',
    );
    // Europe/London switches to BST on 2026-03-29 at 01:00 UTC.
    expect(businessMidnight('2026-03-29', 'Europe/London').toISOString()).toBe(
      '2026-03-29T00:00:00.000Z',
    );
    expect(businessMidnight('2026-03-30', 'Europe/London').toISOString()).toBe(
      '2026-03-29T23:00:00.000Z',
    );
  });

  it('returns the previous business day and the previous ISO week', () => {
    // Monday 2026-09-28 01:30 in Karachi.
    const now = new Date('2026-09-27T20:30:00Z');
    expect(lastClosedPeriod(now, 'DAILY', 'Asia/Karachi')).toEqual({
      start: new Date('2026-09-26T19:00:00Z'),
      end: new Date('2026-09-27T19:00:00Z'),
    });
    expect(lastClosedPeriod(now, 'WEEKLY', 'Asia/Karachi')).toEqual({
      start: new Date('2026-09-20T19:00:00Z'),
      end: new Date('2026-09-27T19:00:00Z'),
    });
    // Sunday 2026-09-27 11:05 in Karachi: the week is still open.
    expect(lastClosedPeriod(new Date('2026-09-27T06:05:00Z'), 'WEEKLY', 'Asia/Karachi')).toEqual({
      start: new Date('2026-09-13T19:00:00Z'),
      end: new Date('2026-09-20T19:00:00Z'),
    });
  });
});
