import { addressLabel, lookUpAddress, type Place } from '../address';

/**
 * The address lookup with both network calls injected, so the whole state
 * machine is exercised without the native module and without a device.
 *
 * The steering itself is not retested here — `data/geocode/__tests__/oahu.test.ts`
 * owns that, including the two-attempt behaviour that must not be simplified.
 * What this file is about is the layer above: what the rider is asked, and what
 * happens when the naming half of the lookup falls over on its own.
 */

const place = (fields: Partial<Place> = {}): Place => ({
  streetNumber: null,
  street: null,
  name: null,
  city: null,
  ...fields,
});

/** UH Manoa, and on the island. */
const ON_OAHU = { latitude: 21.2969, longitude: -157.8171 };
/** State College, Pennsylvania — what `"university"` really returned. */
const OFF_ISLAND = { latitude: 40.7934, longitude: -77.86 };

describe('addressLabel', () => {
  it('reads as a street address and a city', () => {
    expect(
      addressLabel(place({ streetNumber: '2500', street: 'Campus Rd', city: 'Honolulu' }), 'typed'),
    ).toBe('2500 Campus Rd, Honolulu');
  });

  it('falls back to the placemark name when there is no street', () => {
    // "Ala Moana Beach Park" has a name and no street number, which is exactly
    // the query the device probe proved works.
    expect(
      addressLabel(place({ name: 'Ala Moana Beach Park', city: 'Honolulu' }), 'typed'),
    ).toBe('Ala Moana Beach Park, Honolulu');
  });

  it('uses what the rider typed when nothing came back printable', () => {
    expect(addressLabel(place(), '2500 campus rd')).toBe('2500 campus rd');
    expect(addressLabel(undefined, '2500 campus rd')).toBe('2500 campus rd');
  });
});

describe('lookUpAddress', () => {
  it('asks before it moves anything', async () => {
    const result = await lookUpAddress(
      '2500 campus rd',
      async () => [ON_OAHU],
      async () => [place({ streetNumber: '2500', street: 'Campus Rd', city: 'Honolulu' })],
    );

    expect(result).toEqual({
      state: 'confirming',
      label: '2500 Campus Rd, Honolulu',
      coords: { lat: 21.2969, lon: -157.8171 },
    });
  });

  it('confirms with the typed text when the reverse lookup fails', async () => {
    // The geocode succeeded and the point is on the island. All that is missing
    // is its name, and refusing to move would fail a search that worked.
    const result = await lookUpAddress(
      '2500 campus rd',
      async () => [ON_OAHU],
      async () => {
        throw new Error('offline');
      },
    );

    expect(result).toEqual({
      state: 'confirming',
      label: '2500 campus rd',
      coords: { lat: 21.2969, lon: -157.8171 },
    });
  });

  it('says an address off the island is off the island', async () => {
    const result = await lookUpAddress(
      'university',
      async () => [OFF_ISLAND],
      async () => [],
    );

    expect(result).toEqual({ state: 'offIsland' });
    // Not "no such address": that address is real, and a rider who typed a
    // mainland street deserves to be told which of the two happened.
    expect(result.state).not.toBe('none');
  });

  it('keeps "nothing matched" apart from "the lookup fell over"', async () => {
    const none = await lookUpAddress('qqqq', async () => [], async () => []);
    const failed = await lookUpAddress(
      'qqqq',
      async () => {
        throw new Error('offline');
      },
      async () => [],
    );

    expect(none).toEqual({ state: 'none' });
    expect(failed).toEqual({ state: 'failed' });
  });

  it('never reverse-geocodes a point it is not going to offer', async () => {
    // One geocode per submission is what Apple asks for; a second round trip to
    // name a place the rider will never be shown is pure cost.
    const reverse = jest.fn(async () => []);

    await lookUpAddress('university', async () => [OFF_ISLAND], reverse);

    expect(reverse).not.toHaveBeenCalled();
  });
});
