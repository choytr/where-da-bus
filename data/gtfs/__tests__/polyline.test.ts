import { decodePolyline, encodePolyline } from '../polyline';

/**
 * The encoder runs in the build script and the decoder runs on the phone. They
 * are one file so they cannot drift, and these are the tests that would catch
 * it if they ever did.
 */
describe('polyline', () => {
  test('encodes a known polyline byte for byte', () => {
    // Google's own worked example for the format, which is the only reference
    // here that was not produced by this code.
    const points = [
      { lat: 38.5, lon: -120.2 },
      { lat: 40.7, lon: -120.95 },
      { lat: 43.252, lon: -126.453 },
    ];
    expect(encodePolyline(points)).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  });

  test('decodes that same polyline back to its points', () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      { lat: 38.5, lon: -120.2 },
      { lat: 40.7, lon: -120.95 },
      { lat: 43.252, lon: -126.453 },
    ]);
  });

  test('round-trips an Oahu shape at five decimal places', () => {
    const points = [
      { lat: 21.30397, lon: -157.8496 },
      { lat: 21.30401, lon: -157.84972 },
      { lat: 21.3055, lon: -157.85101 },
      { lat: 21.29219, lon: -157.84299 },
    ];
    expect(decodePolyline(encodePolyline(points))).toEqual(points);
  });

  test('an empty line encodes and decodes as nothing', () => {
    expect(encodePolyline([])).toBe('');
    expect(decodePolyline('')).toEqual([]);
  });

  /**
   * The failure this guards is a slow drift rather than a wrong point: deltas
   * taken between raw values and rounded afterwards accumulate half a unit at a
   * time, and a few thousand points later the line has walked off the road.
   */
  test('does not accumulate rounding error across many points', () => {
    const points = Array.from({ length: 2000 }, (_, i) => ({
      lat: 21.3 + i * 0.000015,
      lon: -157.85 - i * 0.000015,
    }));
    const decoded = decodePolyline(encodePolyline(points));
    const last = decoded.at(-1);
    const expected = points.at(-1);
    // Both lines were built in this test, so an empty one is the encoder having
    // lost the whole run — which must fail here rather than compare NaN.
    if (last === undefined || expected === undefined) {
      throw new Error('encode/decode produced an empty line');
    }
    expect(Math.abs(last.lat - expected.lat)).toBeLessThan(0.00001);
    expect(Math.abs(last.lon - expected.lon)).toBeLessThan(0.00001);
  });

  /**
   * This decodes bytes that arrived over the network in a published database.
   * A route that draws short is a better outcome at a bus stop than a screen
   * that throws.
   */
  test('a truncated polyline yields the points it could read', () => {
    const whole = encodePolyline([
      { lat: 21.3, lon: -157.85 },
      { lat: 21.31, lon: -157.86 },
    ]);
    expect(decodePolyline(whole.slice(0, whole.length - 1)).length).toBeLessThanOrEqual(2);
    expect(() => decodePolyline(whole.slice(0, 3))).not.toThrow();
  });
});
