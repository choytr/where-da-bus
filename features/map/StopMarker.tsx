import { memo, useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker, type MarkerPressEvent } from 'react-native-maps';
import { schedule } from '../../lib/schedule';
import { useTheme } from '../../lib/theme';
import type { StopWithDistance } from '../../data/gtfs/types';

/**
 * One stop on the map: a tile, and the stop's name written under it.
 *
 * **It draws its own view, which is the point.** Every stop used to be an
 * identical generic MapKit teardrop whose name appeared only in MapKit's own
 * white callout, on tap. That had three problems and this component exists for
 * all three.
 *
 * *The map said nothing.* Twelve identical pins carry no information; a rider
 * comparing two stops a block apart had to tap each one to find out what they
 * were. The name is now on the map, which is what Apple Maps and Google Maps
 * both do — Truman sent screenshots of both on 2026-08-08 and asked for this.
 *
 * *The bubble looked wrong.* A white rectangle floating above a pin on a dark
 * map, drawn by MapKit and unstyleable from here.
 *
 * *And MapKit was keeping a second selection.* A `Marker` given a `title` gets
 * a native callout, and MapKit decides by itself when that callout is up and
 * which annotation is selected — state this app never sees and cannot
 * synchronise with `selectedStop`. On a device the two visibly disagreed:
 * a callout up and a pin enlarged over a sheet showing no selection at all.
 * **No `title` is passed here, deliberately.** Restoring it restores the
 * disagreement. The name reaches VoiceOver through `accessibilityLabel`
 * instead, which carries no callout with it.
 */

/** Reads at a glance without becoming the map. Selected grows rather than recolours. */
const SLOT = 34;
const TILE = 24;
const TILE_SELECTED = 32;
const GAP = 3;
/** Fixed so the anchor below is a constant: a one-line name must not shift the pin. */
const LABEL_HEIGHT = 28;
const WIDTH = 124;

/**
 * The coordinate sits at the centre of the tile, not the centre of the view —
 * the name hangs below and is not part of where the stop *is*. Constant
 * because `LABEL_HEIGHT` is.
 */
const ANCHOR = { x: 0.5, y: SLOT / 2 / (SLOT + GAP + LABEL_HEIGHT) };

/**
 * How long the marker keeps re-snapshotting itself after its appearance
 * changes.
 *
 * iOS renders a custom marker view to a bitmap. With `tracksViewChanges` left
 * at its default it re-renders that bitmap every frame, for every marker, for
 * as long as the marker is on screen — the documented way to make a map with
 * custom markers unusable. Held true just long enough for a changed tile to be
 * captured, then dropped.
 */
const TRACK_MS = 450;

export type StopMarkerProps = {
  stop: StopWithDistance;
  selected: boolean;
  /**
   * Takes the stop rather than closing over it, so this component can be
   * memoised: a fresh arrow per stop per render would defeat `memo` entirely,
   * and re-rendering markers is the cost this component is shaped to avoid.
   */
  onPress: (stop: StopWithDistance, event: MarkerPressEvent) => void;
};

export const StopMarker = memo(function StopMarker({ stop, selected, onPress }: StopMarkerProps) {
  const { palette } = useTheme();
  const [tracking, setTracking] = useState(true);

  // Re-run on `selected` because that is the only thing that changes how this
  // draws. Mount included: the first bitmap has to be captured too.
  useEffect(() => {
    setTracking(true);
    return schedule(() => setTracking(false), TRACK_MS);
  }, [selected]);

  const handlePress = useCallback(
    (event: MarkerPressEvent) => onPress(stop, event),
    [onPress, stop],
  );

  const size = selected ? TILE_SELECTED : TILE;

  return (
    <Marker
      identifier={stop.stop_id}
      coordinate={{ latitude: stop.lat, longitude: stop.lon }}
      anchor={ANCHOR}
      // Selected draws over its neighbours; without this it can end up behind
      // one of the pins it just grew past.
      zIndex={selected ? 2 : 1}
      tracksViewChanges={tracking}
      accessibilityLabel={stop.stop_name}
      onPress={handlePress}
    >
      <View style={styles.wrap} pointerEvents="none">
        <View style={styles.slot}>
          <View
            style={[
              styles.tile,
              {
                width: size,
                height: size,
                borderRadius: size / 4,
                backgroundColor: palette.pin,
                borderColor: palette.background,
              },
            ]}
          >
            <Bus scale={size / TILE} tint={palette.pinGlyph} cut={palette.pin} />
          </View>
        </View>

        <Text
          numberOfLines={2}
          style={[
            styles.label,
            selected && styles.labelSelected,
            {
              color: palette.text,
              // A halo rather than a plate. Map tiles run from pale sand to
              // dark green under the same label, and a shadow in the screen's
              // own background colour keeps the text readable over all of it
              // without drawing a box the eye has to parse.
              textShadowColor: palette.background,
            },
          ]}
        >
          {stop.stop_name}
        </Text>
      </View>
    </Marker>
  );
});

/**
 * A bus, at 14×11 before scaling, built out of views.
 *
 * An icon font would be the obvious way and would mean a dependency this
 * project does not have; `@expo/vector-icons` is not installed, and adding one
 * to draw a single 14-point glyph is a poor trade in a repo whose whole
 * dependency policy is about protecting the Expo Go loop. Five views, snapshot
 * once by `tracksViewChanges`, cost nothing after the first frame.
 */
function Bus({ scale, tint, cut }: { scale: number; tint: string; cut: string }) {
  return (
    <View style={[styles.bus, { transform: [{ scale }] }]}>
      <View style={[styles.busBody, { backgroundColor: tint }]}>
        {/* The windscreen is the tile showing through, not a third colour. */}
        <View style={[styles.busWindow, { backgroundColor: cut }]} />
      </View>
      <View style={styles.busWheels}>
        <View style={[styles.busWheel, { backgroundColor: tint }]} />
        <View style={[styles.busWheel, { backgroundColor: tint }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: WIDTH, alignItems: 'center' },
  slot: { height: SLOT, justifyContent: 'center' },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  label: {
    marginTop: GAP,
    height: LABEL_HEIGHT,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    textAlign: 'center',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  labelSelected: { fontWeight: '800' },

  bus: { width: 14, height: 11, alignItems: 'center', justifyContent: 'space-between' },
  busBody: { width: 14, height: 8, borderRadius: 2.5, alignItems: 'center', paddingTop: 1.5 },
  busWindow: { width: 9, height: 3, borderRadius: 1 },
  busWheels: { width: 11, flexDirection: 'row', justifyContent: 'space-between' },
  busWheel: { width: 3, height: 3, borderRadius: 1.5 },
});
