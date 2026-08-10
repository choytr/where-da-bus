import { memo, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { schedule } from '../../lib/schedule';
import { useTheme } from '../../lib/theme';
import { arrowPlacements } from './arrows';
import type { Region } from './region';
import type { Coords } from '../../lib/distance';

/**
 * Which way the route line runs, at a glance.
 *
 * **A fixed pool of markers, mounted once for the life of the map.** Eight
 * exist whether or not a route is showing; outside route mode they sit at the
 * camera's center at opacity zero. Nothing here ever mounts, unmounts or
 * reorders inside `MapView`, which is the seam with the open SIGABRT behind it
 * — see the map section of `docs/backlog.md`. **Do not implement this as one
 * marker per segment**: that is a wholesale swap on every direction flip, into
 * exactly that seam, and it is the design this one replaced.
 *
 * Index keys, which are normally the wrong thing and are right here: the pool
 * is a fixed number of interchangeable slots, and an index is what makes slot 3
 * stay slot 3 while what it draws changes underneath it.
 *
 * **They are drawn before the pins and the buses**, so they sit under both.
 * Their wrapper is deliberately small — an arrowhead is not something anyone
 * aims at, and a wide box would eat taps meant for a stop pin beside it, which
 * is the two-tap problem `stopUnderBus` exists to undo.
 */

/**
 * How many. Constant for the life of the map, by construction rather than by
 * discipline: it is what sizes the pool.
 *
 * Eight is a judgement, not a measurement. Enough to read direction anywhere on
 * a route-scale line, few enough not to be clutter at street scale.
 */
export const ARROW_COUNT = 8;

/** Small enough not to be a tap target; big enough to read at 8 pt. */
const SLOT = 16;

/** The view is the glyph, so the coordinate sits at its center. */
const ANCHOR = { x: 0.5, y: 0.5 };

/** Long enough to capture a changed bitmap, short enough not to keep redrawing. */
const TRACK_MS = 450;

export type RouteArrowsProps = {
  /** The drawn line's points, or empty when no route is showing. Never null. */
  points: readonly Coords[];
  /** The settled camera, or null before the map has reported one. */
  region: Region | null;
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
  halo,
}: {
  /** Which of the fixed pool this is. Stable for the life of the map. */
  slot: number;
  at: Coords;
  bearingDeg: number;
  visible: boolean;
  color: string;
  halo: string;
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
      tracksViewChanges={tracking}
      // The glyph points north, so the marker is turned to the line's bearing.
      // `rotation` rather than a transform on the child: the child is captured
      // to a bitmap, and rotating the annotation is what MapKit is given.
      rotation={bearingDeg}
      // Not a thing anyone taps. `Marker`'s `tappable` is Google Maps only on
      // iOS, so the wrapper is kept small instead — see this file's header.
      accessibilityElementsHidden
    >
      <View style={[styles.slot, { opacity: visible ? 1 : 0 }]} pointerEvents="none">
        <Text style={[styles.glyph, { color, textShadowColor: halo }]}>▲</Text>
      </View>
    </Marker>
  );
});

export const RouteArrows = memo(function RouteArrows({ points, region }: RouteArrowsProps) {
  const { palette } = useTheme();

  // Recomputed when the camera settles, never during a pan: re-snapshotting
  // eight markers per frame is how a map with custom markers becomes unusable.
  const placements =
    region === null
      ? []
      : arrowPlacements(points, region, ARROW_COUNT);

  return (
    <>
      {Array.from({ length: ARROW_COUNT }, (_, index) => {
        const placement = placements[index];
        return (
          <Arrow
            key={index}
            slot={index}
            at={placement?.at ?? FALLBACK}
            bearingDeg={placement?.bearingDeg ?? 0}
            visible={placement?.visible ?? false}
            color={palette.route}
            halo={palette.background}
          />
        );
      })}
    </>
  );
});

/**
 * Where an arrow sits before the map has reported a camera. Mid-Pacific rather
 * than 0,0 — it is never drawn, and a coordinate off the map is one MapKit has
 * to project anyway.
 */
const FALLBACK: Coords = { lat: 21.3069, lon: -157.8583 };

const styles = StyleSheet.create({
  slot: { width: SLOT, height: SLOT, alignItems: 'center', justifyContent: 'center' },
  glyph: {
    fontSize: 11,
    lineHeight: 13,
    // A halo, so the arrowhead stays legible over the map's own tiles. Its
    // colour is the theme's background, set at the call site — map tiles run
    // from pale sand to dark green under the same glyph.
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 2,
  },
});
