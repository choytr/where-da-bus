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
 * the name hangs below and is not part of where the stop *is*.
 *
 * One constant, for a view that is always the same size. `LABEL_HEIGHT` is
 * fixed so a one-line name and a two-line name cannot move the pin off its
 * stop, and the label's *slot* is now always present so an unlabelled stop
 * cannot either. See the note on `showLabel` below for why that matters more
 * than it sounds.
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
   * Whether this stop's name is *visible* under its tile. Decided for the whole
   * set at once by `labelledStopIds` — labelling every stop produced an
   * unreadable heap on a device, see that module.
   *
   * Visible, not present: the label is always mounted and this only changes its
   * opacity. The reason is in the render below and it is not cosmetic.
   */
  showLabel: boolean;
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
  showLabel,
  onPress,
}: StopMarkerProps) {
  const { palette } = useTheme();
  const [tracking, setTracking] = useState(true);

  // The two things that change how this draws. Mount included: the first bitmap
  // has to be captured too.
  useEffect(() => {
    setTracking(true);
    return schedule(() => setTracking(false), TRACK_MS);
  }, [selected, showLabel]);

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
        **No `zIndex`, and the crash log says why.**

        It was `selected ? 2 : 1`. Selecting stops quickly crashed the app
        reliably — the faster the fewer taps — with marker icons blanking out
        alongside. `Expo Go-2026-08-08-011041.ips` is an uncaught Objective-C
        exception from `-[__NSArrayM insertObject:atIndex:]`, raised on the main
        thread inside React Native's Fabric mounting transaction
        (`TelemetryController::pullTransaction`). SIGABRT. Not JavaScript, and
        not MapKit either — the *view mounting* layer, inserting a child
        component view at an index its backing array does not have.

        `zIndex` on a Fabric view is implemented by **reordering sibling views**,
        so changing it emitted exactly that kind of mount instruction against
        `react-native-maps`' component view — which does not keep its marker
        subviews in the ordinary child array, having handed them to MapKit. The
        index React had and the array actually there disagree, and the insert
        goes out of range. The same bookkeeping mismatch, in its non-fatal form,
        is a view that is removed and never re-inserted: the disappearing icons.

        Truman could no longer reproduce the crash once this prop was gone. That
        is a mechanism, three matching symptoms, and a failure to reproduce —
        **but a race that cannot be reproduced is not a race that is proven
        gone**, so this stays written down.

        The cost is that a selected tile can sit behind a neighbour it has grown
        past. Do not reintroduce `zIndex` to fix that; give the tile a form that
        reads when overlapped instead.
      */
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

        {/*
          **Always mounted, hidden with opacity.** It rendered conditionally
          for one build, and on a device markers whose label appeared or
          disappeared jumped bodily to the screen's top-left corner —
          `IMG_4524`, two tiles and their names piled at the origin over the
          status bar, one minute after `IMG_4523` had them in the right places.

          Same root as the crash: adding or removing a child inside a
          `react-native-maps` marker is a mount instruction against a component
          view whose subviews have been handed to MapKit, and RN's bookkeeping
          and the real hierarchy come apart. There the array insert went out of
          range and threw; here the view survives with no position and lands at
          the origin.

          So the tree is structurally constant and only styles change. It costs
          a tap target as wide as the widest label even on a tile with no label
          showing, which is a real trade against pins that stay where the stops
          are.
        */}
        <Text
          numberOfLines={2}
          style={[
            styles.label,
            selected && styles.labelSelected,
            {
              opacity: showLabel ? 1 : 0,
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
