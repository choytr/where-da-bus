import { memo } from 'react';
import { Polyline } from 'react-native-maps';
import { useTheme } from '../../lib/theme';
import type { Coords } from '../../lib/distance';

/**
 * The road a route actually runs on, drawn from the feed's own shape.
 *
 * **Always mounted, and never conditionally rendered.** Route mode changes this
 * component's `coordinates`, never its presence — an empty array when there is
 * nothing to draw. Mounting and unmounting a child inside a `react-native-maps`
 * component is the rule the map section of `docs/backlog.md` exists for:
 * `AIRMap.m`'s `insertReactSubview:` intercepts children, hands them to MapKit,
 * and deliberately never calls super, so the map's real subview list and React's
 * model of it are different things by construction. Changing the tree across
 * that seam has produced a SIGABRT and markers teleporting to the screen's
 * corner. This is the same `opacity` trick the marker labels use, applied to a
 * line.
 *
 * **It is not a line joining the stops up.** That was measured against the real
 * shapes over 236 route/directions: median 29 m out, p90 1.3 km, worst 7.3 km,
 * drawing straight through Kāneʻohe Bay on the express runs. 202 of 236 are
 * ≥150 m wrong at their worst and none is under 50 m. Do not revive it.
 */

/** Wide enough to follow at a glance without burying the street under it. */
const STROKE_WIDTH = 4;

export type RouteLineProps = {
  /** The shape's points, or empty when no route is showing. Never null. */
  points: readonly Coords[];
};

export const RouteLine = memo(function RouteLine({ points }: RouteLineProps) {
  const { palette } = useTheme();

  return (
    <Polyline
      testID="route-line"
      coordinates={points.map((point) => ({ latitude: point.lat, longitude: point.lon }))}
      strokeWidth={STROKE_WIDTH}
      // The same colour as the pins, so the line and the stops on it read as
      // one thing rather than two overlaid answers.
      strokeColor={palette.pin}
    />
  );
});
