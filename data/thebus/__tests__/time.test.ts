import { hawaiiDateTime, hawaiiTimestamp } from '../time';

/**
 * Every time the API emits is Hawaii local with no timezone marker, and
 * Hawaii has no daylight saving, so the offset is a constant UTC−10. These
 * tests assert in UTC because that is the only frame in which the answer does
 * not depend on where the test runs — the bug being guarded against is
 * precisely a parser that lets the device's timezone leak in.
 */
describe('hawaiiDateTime', () => {
  it('reads a scheduled stop time as Hawaii local, not device local', () => {
    expect(hawaiiDateTime('8/1/2026', '10:45 PM')?.toISOString()).toBe('2026-08-02T08:45:00.000Z');
  });

  it('puts 12:21 AM just after midnight rather than just after noon', () => {
    // The fixture crosses midnight here, and a `% 12` that forgets to special-
    // case 12 lands this at 12:21 PM — twelve hours wrong, in the direction
    // that shows a rider a bus twelve hours after it left.
    expect(hawaiiDateTime('8/2/2026', '12:21 AM')?.toISOString()).toBe('2026-08-02T10:21:00.000Z');
  });

  it('puts 12:05 PM just after noon', () => {
    expect(hawaiiDateTime('8/2/2026', '12:05 PM')?.toISOString()).toBe('2026-08-02T22:05:00.000Z');
  });

  it('keeps the date it was given rather than assuming today', () => {
    // The arrivals window spans two calendar days; `stopTime` alone is
    // ambiguous and `date` is what disambiguates it.
    const late = hawaiiDateTime('8/1/2026', '11:42 PM');
    const early = hawaiiDateTime('8/2/2026', '12:21 AM');
    expect(early!.getTime() - late!.getTime()).toBe(39 * 60 * 1000);
  });

  it('accepts single-digit and double-digit month, day and hour', () => {
    expect(hawaiiDateTime('12/9/2026', '5:13 AM')?.toISOString()).toBe('2026-12-09T15:13:00.000Z');
    expect(hawaiiDateTime('12/09/2026', '05:13 AM')?.toISOString()).toBe('2026-12-09T15:13:00.000Z');
  });

  it('reads the whole time rather than a time embedded in it', () => {
    // This is the trap that cost time while probing the API. An unanchored
    // /(\d+):(\d+)\s*(AM|PM)/ finds "08:53 PM" *inside* "10:08:53 PM" and
    // returns 20:53 — 94 minutes off, and plausible enough to look like the
    // API returning bad data rather than the parser being wrong. 22:08:53 is
    // the right answer; 20:53 is the bug.
    expect(hawaiiDateTime('8/1/2026', '10:08:53 PM')?.toISOString()).toBe(
      '2026-08-02T08:08:53.000Z',
    );
  });

  it('rejects a time with anything around it', () => {
    // The other half of anchoring: no leading or trailing text may be ignored.
    expect(hawaiiDateTime('8/1/2026', 'at 10:45 PM')).toBeNull();
    expect(hawaiiDateTime('8/1/2026', '10:45 PM today')).toBeNull();
    expect(hawaiiDateTime('8/1/2026 10:45 PM', '10:45 PM')).toBeNull();
  });

  it('returns null rather than an Invalid Date for junk', () => {
    expect(hawaiiDateTime('', '')).toBeNull();
    expect(hawaiiDateTime('8/1/2026', '')).toBeNull();
    expect(hawaiiDateTime('not a date', '10:45 PM')).toBeNull();
    expect(hawaiiDateTime('8/1/2026', '25:00 PM')).toBeNull();
    expect(hawaiiDateTime('8/1/2026', '10:45')).toBeNull();
    expect(hawaiiDateTime('8/1/2026', '10:60 PM')).toBeNull();
  });

  it('reads am/pm case-insensitively', () => {
    expect(hawaiiDateTime('8/1/2026', '10:45 pm')?.toISOString()).toBe('2026-08-02T08:45:00.000Z');
  });
});

describe('hawaiiTimestamp', () => {
  it('reads the server timestamp, which carries seconds', () => {
    expect(hawaiiTimestamp('8/1/2026 10:35:40 PM')?.toISOString()).toBe('2026-08-02T08:35:40.000Z');
  });

  it('accepts a timestamp without seconds', () => {
    expect(hawaiiTimestamp('8/1/2026 10:35 PM')?.toISOString()).toBe('2026-08-02T08:35:00.000Z');
  });

  it('returns null for junk', () => {
    expect(hawaiiTimestamp('')).toBeNull();
    expect(hawaiiTimestamp('8/1/2026')).toBeNull();
    expect(hawaiiTimestamp('nonsense')).toBeNull();
  });
});
