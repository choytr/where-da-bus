import { memo, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { schedule } from '../../lib/schedule';
import { useTheme } from '../../lib/theme';
import { adherenceOf } from './adherence';
import type { LabelPlacement } from './labels';
import type { BusOnMap } from './useVehicles';

/**
 * One bus on the route, with its fleet number and how old its position is.
 *
 * **Every rule `StopMarker` follows applies here and is not optional**, and this
 * layer is the one that tests them: stops change only when a rider pans, while
 * buses are added and removed every sixty seconds. That is far more churn
 * across the seam behind the SIGABRT in `docs/backlog.md` than anything shipped
 * so far.
 *
 * - **The label is always mounted** and hidden with `opacity`. Rendering it
 *   conditionally once made markers jump bodily to the screen's top-left corner.
 *   It used to be always *visible* as well, on the reasoning that the age is why
 *   the bus is drawn at all; a device round on 2026-08-09 showed twelve of them
 *   overprinting each other and the stop pins, so it now takes a `placement`
 *   from the same collision map the stop names go through.
 * - **It is `position: 'absolute'`**, outside the marker's layout box, because
 *   `AIRMapMarker.reactSetFrame:` sizes the annotation view from the React
 *   layout and MapKit hit-tests by frame — a label counted in the layout eats
 *   taps meant for the pin beside it.
 * - **No `zIndex`.** Removing it is what made the crash stop reproducing.
 * - **`tracksViewChanges` pulses false** after the bitmap is captured, or every
 *   marker re-renders every frame for as long as it is on screen.
 *
 * A bus is `memo`ised on its label string, so the thirty-second age tick costs
 * nothing for a bus whose text did not change.
 */

/** Round, where a stop's tile is square: shape says which layer at a glance. */
const SLOT = 34;
const DOT = 22;
const GAP = 3;
const LABEL_HEIGHT = 14;
const WIDTH = 150;

/** The view is the dot and nothing else, so the coordinate sits at its centre. */
const ANCHOR = { x: 0.5, y: 0.5 };

/** Long enough to capture a changed bitmap, short enough not to keep redrawing. */
const TRACK_MS = 450;

/**
 * "here 20 s ago" — Truman asked for this by name, after the old DaBus app.
 *
 * Coarse on purpose. The value is recomputed on a thirty-second tick, so a
 * second-by-second reading would be precise about a number it cannot keep
 * current, and every change costs a re-snapshot of the marker.
 */
export function ageWords(ageMs: number): string {
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 15) return 'here now';
  if (seconds < 60) return `here ${Math.floor(seconds / 15) * 15} s ago`;
  const minutes = Math.floor(seconds / 60);
  return `here ${minutes} min ago`;
}

/** `252 · here 20 s ago` — the fleet number, and how much to trust the dot. */
export function busLabel(bus: BusOnMap): string {
  return `${bus.vehicle.number} · ${ageWords(bus.ageMs)}`;
}

export type BusMarkerProps = {
  bus: BusOnMap;
  /** Drawn larger, for the bus behind the arrival a rider just tapped. */
  highlighted: boolean;
  /**
   * Which side of the dot the fleet number sits on, or null for a bare dot.
   *
   * **This used to be unconditional**, and on a device that was twelve labels
   * overprinting each other and the stop pins at route scale — 2026-08-09,
   * screenshot 2. Buses now go through the same collision map as stop names,
   * and are suppressed entirely at route scale, where the dot alone is the
   * answer. Null means *invisible*, never absent; see the render.
   */
  placement: LabelPlacement | null;
};

export const BusMarker = memo(
  function BusMarker({ bus, highlighted, placement }: BusMarkerProps) {
    const { palette } = useTheme();
    const [tracking, setTracking] = useState(true);

    const label = busLabel(bus);
    const adherence = adherenceOf(bus.vehicle.adherence);

    // Mount included: the first bitmap has to be captured too.
    useEffect(() => {
      setTracking(true);
      return schedule(() => setTracking(false), TRACK_MS);
    }, [label, highlighted, placement, adherence]);

    const size = highlighted ? DOT + 6 : DOT;

    /**
     * The ring. On time and unreported both keep the plain contrast border —
     * absence means fine, which is what stops route scale reading as a wall of
     * traffic lights when most of a fleet is a couple of minutes behind.
     */
    const ring =
      adherence === 'late'
        ? palette.late
        : adherence === 'early'
          ? palette.early
          : palette.background;

    return (
      <Marker
        identifier={`bus-${bus.vehicle.number}`}
        coordinate={{ latitude: bus.vehicle.position.lat, longitude: bus.vehicle.position.lon }}
        anchor={ANCHOR}
        tracksViewChanges={tracking}
        // No `title`: a `Marker` with one gets a native callout that MapKit
        // selects by itself, which is a second selection this app cannot see.
        accessibilityLabel={label}
      >
        <View style={styles.wrap} pointerEvents="none">
          <View
            style={[
              styles.dot,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: palette.live,
                borderColor: ring,
                // Wider when it is saying something, so the hue has enough
                // pixels to be a colour rather than an edge.
                borderWidth: adherence === 'late' || adherence === 'early' ? 3 : 2,
              },
            ]}
          />

          {/* Always mounted; see this file's header. */}
          <Text
            numberOfLines={1}
            style={[
              styles.label,
              placement === 'above' ? styles.labelAbove : styles.labelBelow,
              highlighted && styles.labelHighlighted,
              {
                opacity: placement === null ? 0 : 1,
                color: palette.text,
                // A halo rather than a plate: map tiles run from pale sand to
                // dark green under the same label.
                textShadowColor: palette.background,
              },
            ]}
          >
            {label}
          </Text>
        </View>
      </Marker>
    );
  },
  // The label already folds in the fleet number and the age, which are the only
  // two things that can change what this draws.
  (before, after) =>
    busLabel(before.bus) === busLabel(after.bus) &&
    before.highlighted === after.highlighted &&
    before.placement === after.placement &&
    adherenceOf(before.bus.vehicle.adherence) === adherenceOf(after.bus.vehicle.adherence) &&
    before.bus.vehicle.position.lat === after.bus.vehicle.position.lat &&
    before.bus.vehicle.position.lon === after.bus.vehicle.position.lon,
);

const styles = StyleSheet.create({
  wrap: { width: SLOT, height: SLOT, alignItems: 'center', justifyContent: 'center' },
  // `borderWidth` and `borderColor` are set at the call site — they carry the
  // adherence ring.
  dot: {},
  label: {
    position: 'absolute',
    left: (SLOT - WIDTH) / 2,
    width: WIDTH,
    height: LABEL_HEIGHT,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    textAlign: 'center',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  labelBelow: { top: SLOT + GAP },
  // Same gap, off the other edge. `labels.ts` places a number here when there
  // is no room beneath — which on a route is often, buses being strung along
  // one line rather than scattered.
  labelAbove: { top: -(LABEL_HEIGHT + GAP) },
  labelHighlighted: { fontWeight: '800' },
});
