import { memo, useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker, type MarkerPressEvent } from 'react-native-maps';
import { schedule } from '../../lib/schedule';
import { useTheme } from '../../lib/theme';
import type { StopWithDistance } from '../../data/gtfs/types';
import type { LabelPlacement } from './labels';

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
/**
 * Two lines' worth, fixed. It no longer decides the anchor — the label is out
 * of the layout entirely — but `labels.ts` measures collisions against this
 * number, so the box the culler reasons about and the box drawn here have to be
 * the same box.
 */
const LABEL_HEIGHT = 28;
const WIDTH = 124;

/**
 * The view is the size of the tile and nothing else, so the coordinate sits at
 * its centre.
 *
 * **The name is positioned absolutely, outside that box, on purpose.**
 * `AIRMapMarker.reactSetFrame:` sets the annotation view's `bounds` from the
 * React layout size, and MapKit hit-tests annotation views by their frame — so
 * a label counted in the layout is a label that swallows taps meant for the
 * tile next to it. Truman: "sometimes they can be on top of other icons and I
 * think they're eating the press on those icons." Read out of the library's own
 * source, `ios/AirMaps/AIRMapMarker.m`, rather than guessed.
 *
 * That same method also shifts the marker's centre whenever the view's height
 * changes, to keep its bottom edge over the same spot — a second, independent
 * reason this box must not grow and shrink as labels come and go.
 */
const ANCHOR = { x: 0.5, y: 0.5 };

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
   * Which side of the tile this stop's name is drawn on, or null for a tile
   * with no name. Decided for the whole set at once by `labelledStopIds` —
   * labelling every stop produced an unreadable heap on a device, and labelling
   * them all below produced names underneath other stops' tiles.
   *
   * Null means *invisible*, not absent: the label is always mounted and this
   * only changes its opacity and its offset. The reason is in the render below
   * and it is not cosmetic.
   */
  placement: LabelPlacement | null;
  /**
   * Takes the stop rather than closing over it, so this component can be
   * memoised: a fresh arrow per stop per render would defeat `memo` entirely,
   * and re-rendering markers is the cost this component is shaped to avoid.
   */
  onPress: (stop: StopWithDistance, event: MarkerPressEvent) => void;
};

export const StopMarker = memo(function StopMarker({
  stop,
  selected,
  placement,
  onPress,
}: StopMarkerProps) {
  const { palette } = useTheme();
  const [tracking, setTracking] = useState(true);

  // The two things that change how this draws. Mount included: the first bitmap
  // has to be captured too.
  useEffect(() => {
    setTracking(true);
    return schedule(() => setTracking(false), TRACK_MS);
  }, [selected, placement]);

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
      /*
        **No `zIndex`.** It was `selected ? 2 : 1`, and selecting stops quickly
        crashed the app reliably — the faster the fewer taps — with marker icons
        blanking out alongside. `Expo Go-2026-08-08-011041.ips` is an uncaught
        `-[__NSArrayM insertObject:atIndex:]` raised on the main thread inside
        React Native's Fabric mounting transaction. SIGABRT. Removing this prop
        is what made the crash stop reproducing.

        **What is established, and what is not.** The log is certain: something
        asked the mounting layer to insert a child view at an index its array
        did not have. `AIRMap.m` is certain too — `insertReactSubview:`
        intercepts markers, hands them to MapKit as annotations, and
        deliberately never calls super, so the map's real subview list and
        React's model of it are different things by construction.

        *Why this prop in particular* is **not** established, and an earlier
        version of this comment claimed it was. It said `zIndex` is implemented
        by reordering sibling views. `AIRMapMarkerManager.m` exports `zIndex` as
        a plain native prop that becomes `layer.zPosition` — an assignment, not
        a reorder. Whether React Native's own view ordering reacted to it as
        well is unread, those sources being prebuild output this project never
        generates. So: correlation, a plausible route, and no proof.

        Do not reintroduce it to make a selected tile draw above its neighbours.
        Give the tile a form that reads when overlapped instead.
      */
      tracksViewChanges={tracking}
      accessibilityLabel={stop.stop_name}
      onPress={handlePress}
    >
      <View style={styles.wrap} pointerEvents="none">
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

        {/*
          **Always mounted, hidden with opacity, and outside the layout box.**

          It rendered conditionally for one build, and on a device the markers
          whose label appeared or disappeared jumped bodily to the screen's
          top-left corner — `IMG_4524`, two tiles and their names piled at the
          origin over the status bar, a minute after `IMG_4523` had them in the
          right places. Mounting and unmounting a child inside a
          `react-native-maps` marker is a mount instruction against a view whose
          subviews belong to MapKit, and it is the same family as the crash.

          Absolutely positioned for a second and independent reason — see
          `ANCHOR`. A label counted in the layout makes the annotation view that
          wide, and MapKit hit-tests by frame, so the label eats taps aimed at
          the tile beside it.
        */}
        <Text
          numberOfLines={2}
          style={[
            styles.label,
            placement === 'above' ? styles.labelAbove : styles.labelBelow,
            selected && styles.labelSelected,
            {
              opacity: placement === null ? 0 : 1,
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
  // Tile-sized: the label below is absolute and adds nothing to it.
  wrap: { width: SLOT, height: SLOT, alignItems: 'center', justifyContent: 'center' },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  label: {
    position: 'absolute',
    // Centred on the tile by hanging equally off both sides.
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
  // Same gap, measured off the other edge. `labels.ts` places a name here when
  // there is no room beneath, which is what both reference maps do in a crowd.
  labelAbove: { top: -(LABEL_HEIGHT + GAP) },
  labelSelected: { fontWeight: '800' },

  bus: { width: 14, height: 11, alignItems: 'center', justifyContent: 'space-between' },
  busBody: { width: 14, height: 8, borderRadius: 2.5, alignItems: 'center', paddingTop: 1.5 },
  busWindow: { width: 9, height: 3, borderRadius: 1 },
  busWheels: { width: 11, flexDirection: 'row', justifyContent: 'space-between' },
  busWheel: { width: 3, height: 3, borderRadius: 1.5 },
});
