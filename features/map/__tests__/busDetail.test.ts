import { ageWords, busDetailLines, busLabel, latenessWords } from '../busDetail';
import type { BusOnMap } from '../useVehicles';

const busOnMap = (ageMs: number, adherence: number | null = 4): BusOnMap => ({
  ageMs,
  vehicle: {
    number: '252',
    tripId: 't-1',
    route: '1',
    position: { lat: 21.31, lon: -157.85 },
    headsign: 'WAIKIKI',
    adherence,
    lastMessage: new Date('2026-08-02T21:42:40Z'),
  },
});

describe('ageWords', () => {
  /**
   * Coarse on purpose: the value is recomputed on a thirty-second tick, and
   * every change re-snapshots the marker's bitmap. Precision it cannot keep
   * current would cost redraws for nothing.
   */
  it('says "here now" for a report that just landed', () => {
    expect(ageWords(3_000)).toBe('here now');
  });

  it('counts seconds in fifteens', () => {
    expect(ageWords(20_000)).toBe('here 15 s ago');
    expect(ageWords(50_000)).toBe('here 45 s ago');
  });

  it('switches to minutes past a minute', () => {
    expect(ageWords(65_000)).toBe('here 1 min ago');
    expect(ageWords(200_000)).toBe('here 3 min ago');
  });
});

describe('busLabel', () => {
  /**
   * The fleet number alone. The age moved into the popup when the popup
   * arrived — and no headsign, because buses are only drawn in route mode and
   * the sheet header already names the route and the direction.
   */
  it('is the fleet number and nothing else', () => {
    expect(busLabel(busOnMap(20_000))).toBe('252');
  });
});

describe('latenessWords', () => {
  /**
   * The vendor's sign convention, and the reason this is words rather than a
   * ring colour. It reads backwards to everyone who meets it: a bus that is
   * *ahead* of schedule reports a *positive* number.
   */
  it('says early rather than late for a positive adherence', () => {
    expect(latenessWords(4)).toBe('4 min ahead');
  });

  it('says behind for a negative one', () => {
    expect(latenessWords(-12)).toBe('12 min behind');
  });

  /** Most of a fleet sits a couple of minutes off; saying so on all of it says nothing. */
  it('says on time inside the band', () => {
    expect(latenessWords(0)).toBe('On time');
    expect(latenessWords(-3)).toBe('On time');
    expect(latenessWords(1)).toBe('On time');
  });

  /**
   * A bus that did not say is not a bus that is on time. Leaving the line out
   * would be the popup claiming one.
   */
  it('names an unreported adherence rather than implying it is fine', () => {
    expect(latenessWords(null)).toBe('Not reporting');
  });

  /**
   * Nothing bounds this. Thirty live values on 2026-08-02 spanned −19 to +4 and
   * no ceiling is documented, so the ±60 an earlier note assumed is not a range
   * this may rely on.
   */
  it('resolves a value far outside any plausible range', () => {
    expect(latenessWords(-140)).toBe('140 min behind');
    expect(latenessWords(90)).toBe('90 min ahead');
  });
});

describe('busDetailLines', () => {
  it('is which bus, how it is running, and how old the position is', () => {
    expect(busDetailLines(busOnMap(20_000, -12))).toEqual([
      '252',
      '12 min behind',
      'here 15 s ago',
    ]);
  });

  /** An employee number must not reach a screen, a log, or a snapshot. */
  it('carries no headsign and nothing from the driver field', () => {
    const lines = busDetailLines(busOnMap(20_000)).join(' ');

    expect(lines).not.toMatch(/WAIKIKI/);
    expect(lines).not.toMatch(/t-1/);
  });
});
