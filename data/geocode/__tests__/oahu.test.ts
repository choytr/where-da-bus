import { biasedQuery, findOnOahu, isOnOahu } from '../oahu';

/**
 * The cases here are the ones the device actually produced on 2026-08-08. The
 * geocoder answered `"university"` with State College, Pennsylvania and `"u"`
 * with Sacramento, California, both as single confident results.
 */

const UH_MANOA = { latitude: 21.2982538, longitude: -157.818837 };
const ALA_MOANA = { latitude: 21.2989524, longitude: -157.8526839 };
const PENN_STATE = { latitude: 40.811916, longitude: -77.8517852 };
const SACRAMENTO = { latitude: 38.5696284, longitude: -121.5040514 };

const answering = (...results: { latitude: number; longitude: number }[]) =>
  jest.fn().mockResolvedValue(results);

describe('biasedQuery', () => {
  it('names the state, because the geocoder will not assume it', () => {
    expect(biasedQuery('2500 campus road')).toBe('2500 campus road, HI');
  });

  it('leaves a query that already names the place alone', () => {
    // Appending to these produces "..., Honolulu, HI, HI", which is worse
    // input than what was typed.
    expect(biasedQuery('2500 campus road, Honolulu')).toBe('2500 campus road, Honolulu');
    expect(biasedQuery('kailua, hawaii')).toBe('kailua, hawaii');
    expect(biasedQuery('somewhere on Oahu')).toBe('somewhere on Oahu');
    expect(biasedQuery('1000 Bishop St, HI')).toBe('1000 Bishop St, HI');
  });

  it('does not mistake those words inside longer ones', () => {
    // "Hilo" starts with "hi" and is on the wrong island; "Ohio" contains no
    // word boundary around "hi" either.
    expect(biasedQuery('hilo street')).toBe('hilo street, HI');
    expect(biasedQuery('ohio avenue')).toBe('ohio avenue, HI');
  });

  it('trims, and leaves nothing to ask about nothing', () => {
    expect(biasedQuery('  bishop st  ')).toBe('bishop st, HI');
    expect(biasedQuery('   ')).toBe('');
  });
});

describe('isOnOahu', () => {
  it('accepts points on the island', () => {
    expect(isOnOahu({ lat: 21.2983, lon: -157.8188 })).toBe(true); // UH Manoa
    expect(isOnOahu({ lat: 21.3069, lon: -157.8583 })).toBe(true); // downtown
    expect(isOnOahu({ lat: 21.7, lon: -158.0 })).toBe(true); // Kahuku
  });

  it('rejects the mainland, and the neighbouring islands', () => {
    expect(isOnOahu({ lat: 40.8119, lon: -77.8518 })).toBe(false); // Pennsylvania
    expect(isOnOahu({ lat: 38.5696, lon: -121.504 })).toBe(false); // California
    expect(isOnOahu({ lat: 19.7297, lon: -155.09 })).toBe(false); // Hilo, Big Island
    expect(isOnOahu({ lat: 20.8893, lon: -156.4729 })).toBe(false); // Kahului, Maui
  });
});

describe('findOnOahu', () => {
  it('returns a point on the island', async () => {
    const geocode = answering(UH_MANOA);

    await expect(findOnOahu('2500 campus road', geocode)).resolves.toEqual({
      kind: 'found',
      coords: { lat: UH_MANOA.latitude, lon: UH_MANOA.longitude },
    });
    expect(geocode).toHaveBeenCalledWith('2500 campus road, HI');
  });

  it('refuses a confident answer from the wrong continent', async () => {
    // The whole reason this module exists. Before it, this went straight to
    // the map and moved the anchor to Pennsylvania.
    await expect(findOnOahu('university', answering(PENN_STATE))).resolves.toEqual({
      kind: 'offIsland',
    });
    await expect(findOnOahu('u', answering(SACRAMENTO))).resolves.toEqual({ kind: 'offIsland' });
  });

  it('takes the first result that is on the island, not the first result', async () => {
    // One result per query is all the device has ever returned, but nothing
    // documents that, and taking [0] blindly is the bug being fixed.
    await expect(findOnOahu('campus road', answering(PENN_STATE, UH_MANOA))).resolves.toEqual({
      kind: 'found',
      coords: { lat: UH_MANOA.latitude, lon: UH_MANOA.longitude },
    });
  });

  it('keeps "nothing matched" apart from "matched somewhere else"', async () => {
    // Different things to be told: one means try another spelling, the other
    // means the address is real and not here.
    await expect(findOnOahu('qqqq', answering())).resolves.toEqual({ kind: 'none' });
  });

  it('reports a failed lookup as a failure, not as an empty result', async () => {
    const geocode = jest.fn().mockRejectedValue(new Error('offline'));

    await expect(findOnOahu('bishop st', geocode)).resolves.toEqual({ kind: 'failed' });
  });

  it('asks again without the steer when the steer found nothing', async () => {
    // Measured on a device 2026-08-08: "ala moana beach" resolves correctly and
    // "ala moana beach, HI" returns nothing at all. A hint that turns a right
    // answer into no answer is worse than no hint.
    const geocode = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([ALA_MOANA]);

    await expect(findOnOahu('ala moana beach', geocode)).resolves.toEqual({
      kind: 'found',
      coords: { lat: ALA_MOANA.latitude, lon: ALA_MOANA.longitude },
    });
    expect(geocode).toHaveBeenNthCalledWith(1, 'ala moana beach, HI');
    expect(geocode).toHaveBeenNthCalledWith(2, 'ala moana beach');
  });

  it('asks again when the steer found somewhere off the island', async () => {
    const geocode = jest
      .fn()
      .mockResolvedValueOnce([PENN_STATE])
      .mockResolvedValueOnce([ALA_MOANA]);

    await expect(findOnOahu('ala moana beach', geocode)).resolves.toEqual({
      kind: 'found',
      coords: { lat: ALA_MOANA.latitude, lon: ALA_MOANA.longitude },
    });
  });

  it('does not ask twice when the steer already succeeded', async () => {
    // One geocode per user action is what Apple asks for. The second attempt
    // exists for the failures, and must not become the normal path.
    const geocode = answering(UH_MANOA);

    await findOnOahu('2500 campus road', geocode);

    expect(geocode).toHaveBeenCalledTimes(1);
  });

  it('does not ask twice when the text already named the place', async () => {
    // Both attempts would be the same string, so the second is pure waste.
    const geocode = answering();

    await findOnOahu('bishop st, honolulu', geocode);

    expect(geocode).toHaveBeenCalledTimes(1);
  });

  it('still reports off-island when both attempts land on the mainland', async () => {
    const geocode = jest.fn().mockResolvedValue([PENN_STATE]);

    await expect(findOnOahu('university', geocode)).resolves.toEqual({ kind: 'offIsland' });
  });

  it('asks nothing at all when nothing was typed', async () => {
    const geocode = answering(UH_MANOA);

    await expect(findOnOahu('   ', geocode)).resolves.toEqual({ kind: 'none' });
    expect(geocode).not.toHaveBeenCalled();
  });
});
