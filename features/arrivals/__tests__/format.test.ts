import { ageLabel, countdown, hawaiiClock, serverClockOffset } from '../format';

describe('hawaiiClock', () => {
  it('renders an instant as the wall clock in Honolulu, not on the device', () => {
    // A rider in Hawaii has an HST device and would not notice the difference.
    // Every machine this is developed and tested on would, and the arrival
    // time a bus keeps is Hawaii's.
    expect(hawaiiClock(new Date('2026-08-02T08:45:00.000Z'))).toBe('10:45 PM');
  });

  it('writes midnight as 12 AM and noon as 12 PM', () => {
    expect(hawaiiClock(new Date('2026-08-02T10:00:00.000Z'))).toBe('12:00 AM');
    expect(hawaiiClock(new Date('2026-08-02T22:00:00.000Z'))).toBe('12:00 PM');
  });

  it('pads minutes but not the hour', () => {
    expect(hawaiiClock(new Date('2026-08-02T15:05:00.000Z'))).toBe('5:05 AM');
  });
});

describe('countdown', () => {
  const now = new Date('2026-08-02T08:00:00.000Z');
  const inMinutes = (m: number) => new Date(now.getTime() + m * 60_000);

  it('says a bus at the stop is arriving rather than showing a zero', () => {
    expect(countdown(inMinutes(0), now)).toBe('Arriving');
    expect(countdown(inMinutes(0.4), now)).toBe('Arriving');
  });

  it('says a bus that is already due is arriving, not overdue by a negative', () => {
    // The API does not return times in the past, but a device clock a few
    // minutes fast will manufacture them. "-3 min" is not a thing to show.
    expect(countdown(inMinutes(-3), now)).toBe('Arriving');
  });

  it('counts whole minutes up to an hour', () => {
    expect(countdown(inMinutes(1), now)).toBe('1 min');
    expect(countdown(inMinutes(4), now)).toBe('4 min');
    expect(countdown(inMinutes(59), now)).toBe('59 min');
  });

  it('rounds down, so a bus is never announced early', () => {
    // 4.9 minutes is "4 min". Rounding up would tell a rider they have five
    // minutes when they have four and a half.
    expect(countdown(inMinutes(4.9), now)).toBe('4 min');
  });

  it('switches to hours past the hour mark, since the window runs 2.5 hours', () => {
    expect(countdown(inMinutes(60), now)).toBe('1h 00m');
    expect(countdown(inMinutes(83), now)).toBe('1h 23m');
    expect(countdown(inMinutes(142), now)).toBe('2h 22m');
  });
});

describe('ageLabel', () => {
  const now = new Date('2026-08-02T08:00:00.000Z');
  const secondsAgo = (s: number) => new Date(now.getTime() - s * 1000);

  it('calls a fresh fetch just now', () => {
    expect(ageLabel(secondsAgo(0), now)).toBe('just now');
    expect(ageLabel(secondsAgo(4), now)).toBe('just now');
  });

  it('counts seconds under a minute', () => {
    expect(ageLabel(secondsAgo(12), now)).toBe('12s ago');
    expect(ageLabel(secondsAgo(59), now)).toBe('59s ago');
  });

  it('counts minutes past a minute', () => {
    expect(ageLabel(secondsAgo(60), now)).toBe('1 min ago');
    expect(ageLabel(secondsAgo(185), now)).toBe('3 min ago');
  });

  it('never reports a negative age from a clock that moved', () => {
    expect(ageLabel(new Date(now.getTime() + 5_000), now)).toBe('just now');
  });
});

describe('serverClockOffset', () => {
  it('is zero when the device agrees with the server', () => {
    const t = new Date('2026-08-02T08:00:00.000Z');
    expect(serverClockOffset(t, t)).toBe(0);
  });

  it('measures how far the device clock is from the server clock', () => {
    // Countdowns are computed against the server's clock, corrected onto the
    // device's, so a device running four minutes fast does not turn every
    // arrival into "Arriving".
    const serverTime = new Date('2026-08-02T08:00:00.000Z');
    const fetchedAt = new Date('2026-08-02T08:04:00.000Z');
    expect(serverClockOffset(serverTime, fetchedAt)).toBe(-240_000);
  });
});
