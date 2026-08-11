import { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { schedule } from '../../lib/schedule';
import { arrowPlacements } from './arrows';
import { Z } from './layers';
import type { Coords } from '../../lib/distance';

/**
 * Which way the route line runs, at a glance.
 *
 * **A fixed pool of markers, mounted once for the life of the map.** All of
 * them exist whether or not a route is showing; unused slots park out to sea at
 * opacity zero. Nothing here ever mounts, unmounts or
 * reorders inside `MapView`, which is the seam with the open SIGABRT behind it
 * — see the map section of `docs/backlog.md`. **Do not implement this as one
 * marker per segment**: that is a wholesale swap on every direction flip, into
 * exactly that seam, and it is the design this one replaced.
 *
 * Index keys, which are normally the wrong thing and are right here: the pool
 * is a fixed number of interchangeable slots, and an index is what makes slot 3
 * stay slot 3 while what it draws changes underneath it.
 *
 * **They sit under the pins and the buses by `zIndex`, not by render order.**
 * MapKit's own documentation says the order of annotations sharing a z-index is
 * *arbitrary*, and arbitrary is what a rider sees as things swapping over each
 * other while they pan. `features/map/layers.ts` holds every layer's number.
 * Their wrapper is deliberately small too — an arrowhead is not something
 * anyone aims at, and a wide box would eat taps meant for a stop pin beside it,
 * which is the two-tap problem `stopUnderBus` exists to undo.
 *
 * **The rotation is a view transform, never `Marker`'s `rotation` prop.** That
 * prop is documented `@platform iOS: Google Maps only` in the installed types,
 * and on a device it did exactly nothing: every arrow pointed north whatever
 * the line was doing (2026-08-10, `IMG_4669.png`). It is the third prop in this
 * family to be Google-only — `tappable` and `zoomTapEnabled` are the other two,
 * both in `docs/backlog.md`. **Check the `@platform` line before using any
 * `react-native-maps` prop on this project.** A transform on the child is
 * captured into the annotation's bitmap and so works on Apple Maps.
 *
 * **The arrowhead is white in both themes, and that is not an oversight.**
 * Two earlier tries were wrong for opposite reasons. `palette.route` made it
 * the same red as the line and it vanished — *"not the most readable"*.
 * `palette.background` then made it near-black in dark mode, which reads as a
 * hole punched in the line — *"they look weird just black"*. The thing an
 * arrowhead is seen against is **the line**, not the map, and the line is a
 * saturated red in both themes (`#d92b2b` light, `#ff5a52` dark). So the
 * contrast that matters does not change with the theme, and neither should
 * this. It is the same white chevron every transit map draws on a coloured
 * route.
 */

/**
 * How many slots the pool has. Constant for the life of the map, by
 * construction rather than by discipline: it is what sizes the pool.
 *
 * Bigger than it was, because the arrows are now spaced along the *road* rather
 * than across the screen — a 20 km route at 500 m spacing wants forty of them,
 * and a slot costs an always-mounted marker parked out to sea. What a rider
 * sees at once is still only what fits on screen.
 */
export const ARROW_COUNT = 40;

/** Small enough not to be a tap target; big enough to read against a 4 pt line. */
const SLOT = 20;

/** The arrowhead itself. Points north at rest, which is bearing zero. */
const ARROW_WIDTH = 11;
const ARROW_HEIGHT = 12;

/**
 * Chosen against the route line it sits on, which is red in both themes — so
 * this is a constant rather than a palette entry. See the header.
 */
const ARROW_COLOR = '#ffffff';

/** The view is the glyph, so the coordinate sits at its center. */
const ANCHOR = { x: 0.5, y: 0.5 };

/** Long enough to capture a changed bitmap, short enough not to keep redrawing. */
const TRACK_MS = 450;

export type RouteArrowsProps = {
  /** The drawn line's points, or empty when no route is showing. Never null. */
  points: readonly Coords[];
  /**
   * Which way the map is turned, degrees clockwise from north.
   *
   * Subtracted from every arrow's bearing, because a marker's view is
   * screen-aligned: MapKit turns the map underneath the annotations and leaves
   * them upright. Without it the arrows are correct only while the map faces
   * north.
   */
  heading: number;
};

/**
 * One slot in the pool. Its own component so `tracksViewChanges` can pulse per
 * arrow — a marker whose view is still being tracked re-snapshots every frame.
 */
const Arrow = memo(function Arrow({
  slot,
  at,
  bearingDeg,
  visible,
  color,
}: {
  /** Which of the fixed pool this is. Stable for the life of the map. */
  slot: number;
  at: Coords;
  bearingDeg: number;
  visible: boolean;
  color: string;
}) {
  const [tracking, setTracking] = useState(true);

  // Mount included: the first bitmap has to be captured too.
  useEffect(() => {
    setTracking(true);
    return schedule(() => setTracking(false), TRACK_MS);
  }, [bearingDeg, visible]);

  return (
    <Marker
      identifier={`arrow-${slot}`}
      coordinate={{ latitude: at.lat, longitude: at.lon }}
      anchor={ANCHOR}
      zIndex={Z.arrow}
      tracksViewChanges={tracking}
      // No `rotation` prop: it is Google-Maps-only on iOS. See the header.
      // Not a thing anyone taps. `Marker`'s `tappable` is Google Maps only on
      // iOS too, so the wrapper is kept small instead.
      accessibilityElementsHidden
    >
      <View style={[styles.slot, { opacity: visible ? 1 : 0 }]} pointerEvents="none">
        <View
          testID={`arrow-head-${slot}`}
          style={[
            styles.arrow,
            { borderBottomColor: color },
            // The whole of the direction, and the thing MapKit would not do.
            { transform: [{ rotate: `${bearingDeg}deg` }] },
          ]}
        />
      </View>
    </Marker>
  );
});

export const RouteArrows = memo(function RouteArrows({ points, heading }: RouteArrowsProps) {
  /**
   * **A function of the line alone**, so panning and zooming move nothing.
   * `points` changes only when the drawn route or direction does, which is the
   * one moment an arrow is allowed to move.
   */
  const placements = useMemo(() => arrowPlacements(points, ARROW_COUNT), [points]);

  return (
    <>
      {Array.from({ length: ARROW_COUNT }, (_, index) => {
        const placement = placements[index];
        return (
          <Arrow
            key={index}
            slot={index}
            at={placement?.at ?? FALLBACK}
            // Compass bearing minus the map's own rotation: a screen angle.
            bearingDeg={(placement?.bearingDeg ?? 0) - heading}
            visible={placement?.visible ?? false}
            color={ARROW_COLOR}
          />
        );
      })}
    </>
  );
});

/**
 * Where an arrow sits before the map has reported a camera — the same place
 * `arrows.ts` parks a hidden one, and far out to sea for the same reason: it is
 * never drawn, and an invisible marker should not be sitting over anything a
 * rider might be trying to tap.
 */
const FALLBACK: Coords = { lat: 19.5, lon: -160.5 };

const styles = StyleSheet.create({
  slot: { width: SLOT, height: SLOT, alignItems: 'center', justifyContent: 'center' },
  /**
   * A borders triangle rather than a `▲` glyph. The glyph was 11 pt of a font
   * whose metrics differ per platform, sat off-center in its line box, and
   * carried a text shadow to stay legible; this is an exact shape at an exact
   * size, and it rotates cleanly about its own center.
   */
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: ARROW_WIDTH / 2,
    borderRightWidth: ARROW_WIDTH / 2,
    borderBottomWidth: ARROW_HEIGHT,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
