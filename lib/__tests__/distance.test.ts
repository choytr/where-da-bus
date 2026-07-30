import { metersBetween } from '../distance';

describe('metersBetween', () => {
  const stop5 = { lat: 21.321687, lon: -157.907687 }; // LAGOON DR + IOLANA PL
  const stop6 = { lat: 21.319702, lon: -157.910531 }; // LAGOON DR + KAPALULU PL
  const stop7 = { lat: 21.318565, lon: -157.912124 }; // LAGOON DR + MOKUEA PL

  it('returns zero for identical points', () => {
    expect(metersBetween(stop5, stop5)).toBe(0);
  });

  it('measures a short walk between adjacent stops', () => {
    expect(metersBetween(stop5, stop6)).toBeCloseTo(368.1, 0);
  });

  it('measures a longer gap', () => {
    expect(metersBetween(stop5, stop7)).toBeCloseTo(576.0, 0);
  });

  it('is symmetric', () => {
    expect(metersBetween(stop5, stop6)).toBeCloseTo(metersBetween(stop6, stop5), 6);
  });
});
