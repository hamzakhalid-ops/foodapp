import { businessClock } from './business-time';

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
