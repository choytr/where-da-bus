import { parseArrivals } from '../parse';

import mixed from './fixtures/arrivals-mixed.json';
import empty from './fixtures/arrivals-empty.json';
import errorBadKey from './fixtures/error-bad-key.json';
import errorMissingStop from './fixtures/error-missing-stop.json';
import errorUnspecified from './fixtures/error-unspecified.json';
import errorRouteBadKey from './fixtures/error-route-bad-key.json';

/**
 * These fixtures are real responses, captured from the live API on
 * 2026-08-01 rather than written by hand. Hand-written fixtures would encode
 * what the vendor documentation claims, and the documentation is wrong in the
 * two places that matter most here — `estimated: "2"` is undocumented and is
 * the overwhelming majority of real traffic.
 *
 * `arrivals-mixed.json` is stop 3165 at 22:35 HST: 25 arrivals, two of them
 * tracked by GPS, the rest schedule-only, spanning two calendar days.
 */

const board = () => {
  const result = parseArrivals(mixed);
  if (!result.ok) throw new Error('fixture should parse as a board');
  return result.board;
};

describe('parseArrivals — a real board', () => {
  it('reads the stop and the server clock', () => {
    expect(board().stopCode).toBe('3165');
    expect(board().serverTime.toISOString()).toBe('2026-08-02T08:35:40.000Z');
  });

  it('keeps every arrival the response carried', () => {
    expect(board().arrivals).toHaveLength(25);
  });

  it('marks only the GPS-tracked arrivals live', () => {
    const live = board().arrivals.filter((a) => a.estimate === 'live');
    expect(live).toHaveLength(2);
    expect(live.map((a) => a.vehicle)).toEqual(['871', '266']);
  });

  it('treats the undocumented estimated="2" as scheduled, not as live', () => {
    // The whole reason this parser exists. `estimated` is "2" for 23 of these
    // 25 arrivals; a `!== "0"` test would call every one of them a tracked bus.
    const scheduled = board().arrivals.filter((a) => a.estimate === 'scheduled');
    expect(scheduled).toHaveLength(23);
    expect(scheduled.every((a) => a.vehicle === null)).toBe(true);
  });

  it('drops the "???" vehicle sentinel rather than passing it to a screen', () => {
    expect(board().arrivals.some((a) => a.vehicle === '???')).toBe(false);
  });

  it('drops the "0"/"0" position sentinel, which is in the Gulf of Guinea', () => {
    const positions = board().arrivals.map((a) => a.position).filter((p) => p !== null);
    expect(positions).toHaveLength(2);
    for (const p of positions) {
      expect(p.lat).toBeGreaterThan(20);
      expect(p.lat).toBeLessThan(23);
      expect(p.lon).toBeLessThan(-157);
    }
  });

  it('gives every arrival a position exactly when it is live', () => {
    for (const a of board().arrivals) {
      expect(a.position !== null).toBe(a.estimate === 'live');
    }
  });

  it('resolves times across midnight into ascending instants', () => {
    // The fixture spans 8/1 and 8/2. Reading stopTime without date would put
    // "12:21 AM" 22 hours *before* "11:42 PM" instead of 39 minutes after it.
    const times = board().arrivals.map((a) => a.arrivesAt.getTime());
    expect(times).toEqual([...times].sort((x, y) => x - y));
    expect(new Date(times[0]).toISOString()).toBe('2026-08-02T08:45:00.000Z');
    expect(new Date(times[times.length - 1]).toISOString()).toBe('2026-08-02T20:53:00.000Z');
  });

  it('keeps route names as strings, since not all of them are numbers', () => {
    expect(board().arrivals.map((a) => a.route)).toContain('1L');
  });

  it('carries headsign and direction through unchanged', () => {
    const first = board().arrivals[0];
    expect(first.direction).toBe('Westbound');
    expect(first.headsign).toBe('KAHAUIKI KALIHI TRANSIT CNTR SKYLINE STN');
  });

  it('reports nothing as canceled in a normal response', () => {
    expect(board().arrivals.some((a) => a.canceled)).toBe(false);
  });
});

describe('parseArrivals — an empty board is not an error', () => {
  it('parses a stop with no buses due as a successful, empty board', () => {
    // The distinction §4 turns on. "No buses coming" must never reach the
    // screen as the same value as "couldn't reach the API".
    const result = parseArrivals(empty);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.board.arrivals).toEqual([]);
    expect(result.board.stopCode).toBe('9999999');
    expect(result.board.serverTime.getTime()).not.toBeNaN();
  });
});

/**
 * The end of the month used to take the whole board down, and this is the
 * assertion at the level a rider would feel it.
 *
 * Hawaii is UTC−10, so every time from 2 PM onwards belongs to the next UTC
 * day — and on the last day of a month, the next UTC month. `hawaiiDateTime`
 * validated its calendar *after* applying that offset and rejected the result
 * as an impossible date. Because `timestamp` runs through the same function,
 * the failure was not a thinner board: `serverTime` came back null and the
 * response was called `malformed`, so the screen showed a failure that looked
 * exactly like the API being down. Ten hours, twelve times a year.
 */
describe('parseArrivals — the last evening of a month', () => {
  it('parses a board whose timestamp and arrivals fall on a month end', () => {
    const result = parseArrivals({
      stop: '596',
      timestamp: '8/31/2026 10:35:40 PM',
      arrivals: [
        {
          id: '1',
          trip: '5333993',
          route: '1',
          headsign: 'KALIHI TRANSIT CENTER',
          direction: 'Westbound',
          date: '8/31/2026',
          stopTime: '10:41 PM',
          estimated: '1',
          vehicle: '252',
          latitude: '21.30397',
          longitude: '-157.8496',
          canceled: '0',
        },
        {
          // And one that has crossed into the next month, which is the same
          // response's normal case at that hour.
          id: '2',
          trip: '5333994',
          route: '1',
          headsign: 'KALIHI TRANSIT CENTER',
          direction: 'Westbound',
          date: '9/1/2026',
          stopTime: '12:11 AM',
          estimated: '2',
          vehicle: '???',
          latitude: '0',
          longitude: '0',
          canceled: '0',
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.board.serverTime.toISOString()).toBe('2026-09-01T08:35:40.000Z');
    expect(result.board.arrivals.map((a) => a.arrivesAt.toISOString())).toEqual([
      '2026-09-01T08:41:00.000Z',
      '2026-09-01T10:11:00.000Z',
    ]);
  });
});

describe('parseArrivals — failures', () => {
  it('reports unauthorized for a rejected key', () => {
    // Its own kind rather than a generic `api` failure, because it is the one
    // the user can actually fix and the fix is not "wait". Observed live on
    // 2026-08-03: HTTP 200, and this body for every wrong-key form there is.
    const result = parseArrivals(errorBadKey);
    expect(result).toEqual({ ok: false, failure: { kind: 'unauthorized' } });
  });

  it('reports unauthorized for the route endpoint\'s different wording', () => {
    // The vendor does not use one string. `arrivalsJSON` says "Invalid or
    // unspecified API key" and `routeJSON` says this — both captured live on
    // 2026-08-03. Nothing calls routeJSON today, so a matcher written against
    // the arrivals wording alone would look right and fail silently the first
    // time something does.
    const result = parseArrivals(errorRouteBadKey);
    expect(result).toEqual({ ok: false, failure: { kind: 'unauthorized' } });
  });

  it('does not report unauthorized for a service outage', () => {
    // These two are what a *parameter* problem returns, and task 0 found the
    // API validates parameters before the key -- so a bad key with a bad stop
    // produces these rather than the key error. A looser match would relabel a
    // parameter bug as "your key was rejected" and send the user to Settings
    // to fix something that is not broken.
    for (const [fixture, message] of [
      [errorMissingStop, 'Invalid or unspecified stop ID'],
      [errorUnspecified, 'Unspecified API error'],
    ] as const) {
      const result = parseArrivals(fixture);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure).toEqual({ kind: 'api', message });
    }
  });

  it('calls a response with no arrivals key malformed rather than empty', () => {
    // The vendor field table calls this array `arrival` while every example
    // emits `arrivals`. If they ever ship the singular, an empty board would
    // tell riders no buses are coming when in fact the parser broke.
    const result = parseArrivals({ stop: '45', timestamp: '8/1/2026 10:35:40 PM' });
    expect(result).toEqual({ ok: false, failure: { kind: 'malformed' } });
  });

  it('rejects values that are not objects at all', () => {
    for (const junk of [null, undefined, 'a string', 42, [], true]) {
      expect(parseArrivals(junk)).toEqual({ ok: false, failure: { kind: 'malformed' } });
    }
  });

  it('rejects a board whose timestamp will not parse', () => {
    const result = parseArrivals({ stop: '45', timestamp: 'yesterday', arrivals: [] });
    expect(result).toEqual({ ok: false, failure: { kind: 'malformed' } });
  });

  it('skips an unreadable arrival rather than discarding the whole board', () => {
    // 24 usable arrivals beat an error screen. A rider standing at the stop
    // needs the buses that did parse.
    const result = parseArrivals({
      stop: '45',
      timestamp: '8/1/2026 10:35:40 PM',
      arrivals: [
        { id: '1', trip: 't', route: '2', headsign: 'H', direction: 'Westbound',
          vehicle: '???', estimated: '2', stopTime: '10:45 PM', date: '8/1/2026',
          latitude: '0', longitude: '0', shape: 's', canceled: '0' },
        { id: '2', trip: 't', route: '2', headsign: 'H', direction: 'Westbound',
          vehicle: '???', estimated: '2', stopTime: 'not a time', date: '8/1/2026',
          latitude: '0', longitude: '0', shape: 's', canceled: '0' },
        { id: '3' },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.board.arrivals).toHaveLength(1);
    expect(result.board.arrivals[0].id).toBe('1');
  });

  it('reads canceled="1" as canceled and "-1" as not', () => {
    const make = (canceled: string) => ({
      stop: '45',
      timestamp: '8/1/2026 10:35:40 PM',
      arrivals: [
        { id: '1', trip: 't', route: '2', headsign: 'H', direction: 'Westbound',
          vehicle: '???', estimated: '2', stopTime: '10:45 PM', date: '8/1/2026',
          latitude: '0', longitude: '0', shape: 's', canceled },
      ],
    });
    const canceledOf = (raw: string) => {
      const r = parseArrivals(make(raw));
      if (!r.ok) throw new Error('should parse');
      return r.board.arrivals[0].canceled;
    };
    expect(canceledOf('1')).toBe(true);
    // "-1" is the vendor's "was canceled, now reinstated" — a running bus.
    expect(canceledOf('-1')).toBe(false);
    expect(canceledOf('0')).toBe(false);
  });
});
