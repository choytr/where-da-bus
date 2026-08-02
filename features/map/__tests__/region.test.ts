import { regionAround } from '../region';
import { metersBetween } from '../../../lib/distance';

const HONOLULU = { lat: 21.3069, lon: -157.8583 };

describe('regionAround', () => {
  it('centres on the anchor', () => {
    const region = regionAround(HONOLULU, 1500);
    expect(region.latitude).toBe(HONOLULU.lat);
    expect(region.longitude).toBe(HONOLULU.lon);
  });

  it('contains the whole query radius on the north-south axis', () => {
    const region = regionAround(HONOLULU, 1500);
    const northEdge = { lat: HONOLULU.lat + region.latitudeDelta / 2, lon: HONOLULU.lon };

    expect(metersBetween(HONOLULU, northEdge)).toBeGreaterThan(1500);
  });

  it('contains the whole query radius on the east-west axis too', () => {
    // The one that breaks if the cosine correction is dropped: a degree of
    // longitude is ~7% shorter than a degree of latitude at Oahu's latitude.
    const region = regionAround(HONOLULU, 1500);
    const eastEdge = { lat: HONOLULU.lat, lon: HONOLULU.lon + region.longitudeDelta / 2 };

    expect(metersBetween(HONOLULU, eastEdge)).toBeGreaterThan(1500);
  });

  it('frames the radius closely rather than pulling far back', () => {
    // Both edges are inside 2 km for a 1.5 km query, so this is a walking-scale
    // view. The bare map in task 7 used 0.35 degrees — roughly 39 km, the whole
    // island — which is the failure this guards against.
    const region = regionAround(HONOLULU, 1500);
    const northEdge = { lat: HONOLULU.lat + region.latitudeDelta / 2, lon: HONOLULU.lon };
    const eastEdge = { lat: HONOLULU.lat, lon: HONOLULU.lon + region.longitudeDelta / 2 };

    expect(metersBetween(HONOLULU, northEdge)).toBeLessThan(2000);
    expect(metersBetween(HONOLULU, eastEdge)).toBeLessThan(2000);
    expect(region.latitudeDelta).toBeLessThan(0.05);
  });

  it('is wider east-west than north-south, in degrees', () => {
    const region = regionAround(HONOLULU, 1500);
    expect(region.longitudeDelta).toBeGreaterThan(region.latitudeDelta);
  });

  it('scales with the radius it is given', () => {
    const small = regionAround(HONOLULU, 500);
    const large = regionAround(HONOLULU, 2000);
    expect(large.latitudeDelta / small.latitudeDelta).toBeCloseTo(4, 5);
  });

  it('does not divide by zero at the pole', () => {
    const region = regionAround({ lat: 90, lon: 0 }, 1500);
    expect(Number.isFinite(region.longitudeDelta)).toBe(true);
  });
});
