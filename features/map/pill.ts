/**
 * The map's floating pills — the route pill and *Search this area* — sized
 * once, here, so they cannot drift apart.
 *
 * They did: the route pill was 32 pt tall with a 16 pt radius, and *Search this
 * area* was 9 pt of vertical padding around 14 pt text with an 18 pt radius,
 * which is about 35. Truman, 2026-08-10: *"the two pills should be the same
 * size. The route pill is slightly smaller than the search this area pill."*
 * Two hand-written boxes meant to look identical is exactly the thing that goes
 * quietly out of step, so neither owns its own numbers now.
 */
export const PILL = {
  height: 34,
  paddingHorizontal: 14,
  /** A stadium, at any height. */
  radius: 17,
  fontSize: 14,
} as const;
