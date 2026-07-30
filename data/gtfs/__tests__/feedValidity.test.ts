import { feedValidity, formatFeedDate, parseFeedDate } from '../feedValidity';

/**
 * Every clock here is written out in full. The bundled feed expires on a real
 * date, and a test that read the system clock would start asserting something
 * different on that day — which is exactly the failure this feature exists to
 * warn about, and not one the suite should demonstrate by breaking.
 */
const FEED_END = '20260822';

describe('feedValidity', () => {
  it('calls the feed current on the last day it is valid through', () => {
    // Local midday on the 22nd: the feed is good *through* that day.
    const validity = feedValidity(FEED_END, new Date(2026, 7, 22, 12, 0, 0));
    expect(validity).toEqual({ state: 'current', endsOn: parseFeedDate(FEED_END) });
  });

  it('is still current in the last second of the last day', () => {
    const validity = feedValidity(FEED_END, new Date(2026, 7, 22, 23, 59, 59, 0));
    expect(validity.state).toBe('current');
  });

  it('is expired in the first second of the next day', () => {
    const validity = feedValidity(FEED_END, new Date(2026, 7, 23, 0, 0, 0, 0));
    expect(validity.state).toBe('expired');
  });

  it('is expired long after the end date', () => {
    const validity = feedValidity(FEED_END, new Date(2027, 0, 1, 9, 0, 0));
    expect(validity.state).toBe('expired');
  });

  it('is current long before the end date', () => {
    const validity = feedValidity(FEED_END, new Date(2026, 6, 30, 9, 0, 0));
    expect(validity.state).toBe('current');
  });

  it('carries the end date so the screen can name it', () => {
    const validity = feedValidity(FEED_END, new Date(2027, 0, 1));
    expect(validity.state === 'expired' && formatFeedDate(validity.endsOn)).toBe(
      '22 August 2026',
    );
  });

  it('says unknown rather than current when the feed stated no end date', () => {
    // A feed that never promised anything has not kept a promise.
    expect(feedValidity(null, new Date(2027, 0, 1))).toEqual({ state: 'unknown' });
  });

  it('says unknown for an end date that is not eight digits', () => {
    expect(feedValidity('2026-08-22', new Date(2026, 0, 1))).toEqual({ state: 'unknown' });
    expect(feedValidity('', new Date(2026, 0, 1))).toEqual({ state: 'unknown' });
  });
});

describe('parseFeedDate', () => {
  it('parses YYYYMMDD as the final instant of that day', () => {
    const parsed = parseFeedDate('20260822');
    expect(parsed).toEqual(new Date(2026, 7, 22, 23, 59, 59, 999));
  });

  it('tolerates surrounding whitespace from the feed', () => {
    expect(parseFeedDate(' 20260822 ')).toEqual(parseFeedDate('20260822'));
  });

  it('rejects a date that does not exist rather than rolling it forward', () => {
    // new Date(2026, 1, 31) is 3 March. Silently reading a bad feed date as a
    // week later is how "expired" would quietly become "current".
    expect(parseFeedDate('20260231')).toBeNull();
    expect(parseFeedDate('20261301')).toBeNull();
  });

  it('rejects non-numeric and wrong-length input', () => {
    expect(parseFeedDate('202608')).toBeNull();
    expect(parseFeedDate('2026082x')).toBeNull();
    expect(parseFeedDate('')).toBeNull();
  });
});

describe('formatFeedDate', () => {
  it('spells the month out so the date cannot be read day-first or month-first', () => {
    expect(formatFeedDate(new Date(2026, 7, 22))).toBe('22 August 2026');
    expect(formatFeedDate(new Date(2026, 0, 1))).toBe('1 January 2026');
    expect(formatFeedDate(new Date(2026, 11, 31))).toBe('31 December 2026');
  });
});
