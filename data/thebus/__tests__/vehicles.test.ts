import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseVehicles } from '../vehicles';

/**
 * The fleet endpoint, whose shape is documented and measured in
 * `docs/api/README.md` but which cannot be captured from here — a live call
 * needs Truman's AppID, and it is in his keychain. So `vehicles.xml` is built
 * from the vendor's own example element plus the five conditions the 2026-08-02
 * fleet sample actually contains: a live bus, one whose headsign carries an
 * entity, one with a self-closing `<trip/>`, one four years stale sitting on a
 * real Oahu street, one with the `"0"`/`"0"` position sentinel, and one whose
 * timestamp will not parse.
 *
 * Every element carries a `<driver>`, because the assertion that none of them
 * reaches the app is the point of this file.
 */
const FLEET = readFileSync(join(__dirname, 'fixtures/vehicles.xml'), 'utf8');
const NOT_FOUND = readFileSync(join(__dirname, 'fixtures/not-found.html'), 'utf8');

function fleetOf(xml: string) {
  const result = parseVehicles(xml);
  if (!result.ok) throw new Error(`expected a fleet, got ${result.failure.kind}`);
  return result.fleet;
}

describe('parseVehicles', () => {
  it('reads a bus’s fleet number, position and route', () => {
    const bus = fleetOf(FLEET).vehicles.find((v) => v.number === '252');

    expect(bus).toMatchObject({
      number: '252',
      tripId: '5333993',
      route: '1',
      position: { lat: 21.30397, lon: -157.8496 },
      headsign: 'KAHAUIKI KALIHI TRANSIT CNTR SKYLINE STN',
      adherence: 4,
    });
  });

  it('reads the server’s own clock, which is what a bus’s age is measured from', () => {
    // 11:43 HST is 21:43 UTC — the UTC−10 offset `Date.parse` gets wrong.
    expect(fleetOf(FLEET).serverTime.toISOString()).toBe('2026-08-02T21:43:00.000Z');
  });

  it('reads last_message as Hawaii time, not the device’s', () => {
    const bus = fleetOf(FLEET).vehicles.find((v) => v.number === '252');

    expect(bus?.lastMessage.toISOString()).toBe('2026-08-02T21:42:40.000Z');
  });

  /**
   * The whole reason this parser exists rather than a generic one. `<driver>` is
   * an employee number and sits beside `<number>`, which *is* displayed.
   */
  it('never carries a driver, on any bus', () => {
    for (const bus of fleetOf(FLEET).vehicles) {
      expect(Object.keys(bus)).not.toContain('driver');
      expect(JSON.stringify(bus)).not.toContain('48170');
    }
  });

  it('reads a negative adherence, because positive means early', () => {
    const bus = fleetOf(FLEET).vehicles.find((v) => v.number === '197');

    expect(bus?.adherence).toBe(-3);
  });

  it('decodes an entity in a headsign', () => {
    const bus = fleetOf(FLEET).vehicles.find((v) => v.number === '197');

    expect(bus?.headsign).toBe('KAPOLEI & MAKAKILO');
  });

  /**
   * The vendor sends the literal string `"null"`, not an empty element — for 17
   * of 235 live buses. Read as a route number it would put a route called
   * "null" on the map and match nothing when filtering.
   */
  it('reads a route_short_name of "null" as no route at all', () => {
    const bus = fleetOf(FLEET).vehicles.find((v) => v.number === '410');

    expect(bus?.route).toBeNull();
  });

  it('reads a self-closing trip element as no trip', () => {
    const bus = fleetOf(FLEET).vehicles.find((v) => v.number === '410');

    expect(bus?.tripId).toBeNull();
  });

  /**
   * A bus with no fix would otherwise be drawn in the Gulf of Guinea, 6,000 km
   * away — the same sentinel `parse.ts` rejects on arrivals.
   */
  it('drops a bus carrying the zero-position sentinel', () => {
    expect(fleetOf(FLEET).vehicles.some((v) => v.number === '333')).toBe(false);
  });

  it('drops a bus whose last_message cannot be read', () => {
    // Without an age there is no way to tell it from a ghost, and the freshness
    // rule is the only thing standing between the map and ~1,100 parked buses.
    expect(fleetOf(FLEET).vehicles.some((v) => v.number === '444')).toBe(false);
  });

  /**
   * Staleness is not this parser's business — the freshness window lives in one
   * place, `useVehicles`, applied in both directions. A four-year-old bus with
   * plausible coordinates has to survive parsing in order to be filtered there.
   */
  it('keeps a years-stale bus, leaving freshness to the one rule that owns it', () => {
    const bus = fleetOf(FLEET).vehicles.find((v) => v.number === '801');

    expect(bus?.lastMessage.getUTCFullYear()).toBe(2022);
  });

  it('does not let one unreadable bus sink the rest', () => {
    expect(fleetOf(FLEET).vehicles.map((v) => v.number)).toEqual(['252', '197', '410', '801']);
  });

  it('reads a rejected key as unauthorized rather than as an api error', () => {
    const result = parseVehicles(
      '<?xml version="1.0"?><errorMessage>Invalid or unspecified API key</errorMessage>',
    );

    expect(result).toEqual({ ok: false, failure: { kind: 'unauthorized' } });
  });

  it('keeps a parameter error distinct from a rejected key', () => {
    const result = parseVehicles('<errorMessage>Could not find vehicle "9999"</errorMessage>');

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'api', message: 'Could not find vehicle "9999"' },
    });
  });

  /**
   * Classified by what the document *is*, not by a header. The vendor's
   * content-types are not something this project trusts.
   */
  it('reads an HTML error page as malformed', () => {
    expect(parseVehicles(NOT_FOUND)).toEqual({ ok: false, failure: { kind: 'malformed' } });
  });

  it('reads an empty body as malformed', () => {
    expect(parseVehicles('')).toEqual({ ok: false, failure: { kind: 'malformed' } });
  });

  /**
   * Buses with no readable clock behind them cannot be aged, and an age is the
   * whole of what makes a fleet position trustworthy.
   */
  it('reads a fleet with no readable timestamp as malformed', () => {
    const result = parseVehicles(
      '<vehicles><timestamp>whenever</timestamp><vehicle><number>1</number>' +
        '<latitude>21.3</latitude><longitude>-157.8</longitude>' +
        '<last_message>8/2/2026 11:42:40 AM</last_message></vehicle></vehicles>',
    );

    expect(result).toEqual({ ok: false, failure: { kind: 'malformed' } });
  });

  it('reads an empty fleet as an empty fleet, not as a failure', () => {
    const fleet = fleetOf('<vehicles><timestamp>8/2/2026 11:43:00 AM</timestamp></vehicles>');

    expect(fleet.vehicles).toEqual([]);
  });

  /** Regexes with `g` carry `lastIndex`; a shared one would skip on re-entry. */
  it('gives the same answer when parsed twice', () => {
    expect(fleetOf(FLEET).vehicles.length).toBe(fleetOf(FLEET).vehicles.length);
  });
});
