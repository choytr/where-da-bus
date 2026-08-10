/**
 * How far off schedule a bus is, reduced to the four things the map can say
 * about it.
 *
 * **Its own module because two very different things read it**: `BusMarker`,
 * to colour the ring around a dot, and `useVehicles`, to count how many buses
 * are running late for the line in the route band. Putting it beside either one
 * would make the other import a component from a hook or a hook from a
 * component; putting it here means the two cannot disagree about what "late"
 * is, which is the only way the ring and the count stay honest about each
 * other.
 */

/** The four states. `unknown` is a bus that did not say, not a bus that is fine. */
export type Adherence = 'late' | 'early' | 'onTime' | 'unknown';

/**
 * The band around zero that counts as on time, in minutes.
 *
 * **Asymmetric, and deliberately so.** Running late is ordinary and riders
 * absorb a few minutes of it without noticing; running *early* is the failure
 * that strands someone who arrived on time, so it earns a ring sooner. The
 * shape matches how agencies define on-time performance — a minute or two early
 * at most, several minutes late tolerated.
 *
 * Both are tuning knobs. Neither is measured, and the right band is a judgement
 * only a device can settle.
 */
const LATE_MINUTES = 5;
const EARLY_MINUTES = 2;

/**
 * **Positive minutes mean EARLY.** The vendor's sign convention, recorded in
 * `docs/backlog.md` and backwards to everyone who meets it — which is the whole
 * reason this is a named function with a test rather than a comparison inline
 * in a style prop.
 *
 * Nothing bounds the input. Thirty live values sampled on 2026-08-02 spanned
 * −19 to +4 minutes, and no ceiling is documented anywhere, so a reading far
 * outside any plausible range still has to resolve rather than fall through.
 */
export function adherenceOf(minutes: number | null): Adherence {
  if (minutes === null) return 'unknown';
  if (minutes <= -LATE_MINUTES) return 'late';
  if (minutes >= EARLY_MINUTES) return 'early';
  return 'onTime';
}
