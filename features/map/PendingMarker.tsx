import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker, type MarkerPressEvent } from 'react-native-maps';
import { schedule } from '../../lib/schedule';
import { useTheme } from '../../lib/theme';
import type { Coords } from '../../lib/distance';

/**
 * Where a long press landed, offering to search from there.
 *
 * **The offer is part of the marker, not a callout.** It was a `Callout` with
 * `tooltip`, which meant two things had to happen for a rider to see it: the
 * marker had to mount, and an effect had to call `showCallout()` on its ref a
 * moment later. On a device the second sometimes did not take, and the gesture
 * dropped a pin bearing an invisible offer — observed 2026-08-08. Drawing the
 * pill in the marker's own view removes the step that could fail, and with it
 * the ref, the effect, and the imperative native call.
 *
 * `docs/backlog.md` lists that same `showCallout()` as one of two candidates
 * for the map's occasional crash. **This does not fix that crash and must not
 * be written up as if it did.** It deletes one candidate without testing it,
 * for a reason that stands on its own; the other candidate — unmounting the
 * marker from inside its own press handler — is untouched, because the handler
 * still calls `searchHere`, which still clears `pending`.
 */

const LABEL = 'Search here';

/** Matched to `StopMarker`'s, so the two kinds of pin sit at the same scale. */
const TILE = 26;
const SLOT = 34;
const GAP = 4;
const PILL_HEIGHT = 30;
const WIDTH = 132;

const ANCHOR = { x: 0.5, y: SLOT / 2 / (SLOT + GAP + PILL_HEIGHT) };

/** Long enough for the pill's bitmap to be captured. See `StopMarker`. */
const TRACK_MS = 450;

export type PendingMarkerProps = {
  at: Coords;
  onTake: (coords: Coords) => void;
};

export function PendingMarker({ at, onTake }: PendingMarkerProps) {
  const { palette } = useTheme();
  const [tracking, setTracking] = useState(true);

  useEffect(() => {
    setTracking(true);
    return schedule(() => setTracking(false), TRACK_MS);
  }, []);

  return (
    <Marker
      identifier="pending-anchor"
      coordinate={{ latitude: at.lat, longitude: at.lon }}
      anchor={ANCHOR}
      /*
        No `zIndex` here either, though this one never changed value.
        `StopMarker` explains what the crash log showed: on Fabric, `zIndex`
        means reordering sibling views, and reordering `react-native-maps`'
        marker subviews is what threw. A constant cannot emit a *change*, but it
        still participates in ordering when the marker mounts — and the older
        crash in `docs/backlog.md`, the one Truman narrowed to the tap-hold
        gesture, fires exactly when this component mounts. Cheap insurance
        against a suspect that has already been caught once.

        The offer therefore draws in whatever order MapKit gives it. It is one
        marker against a dozen and it is the largest thing on the map, so being
        overlapped is survivable in a way that being the crash was not.
      */
      tracksViewChanges={tracking}
      accessibilityRole="button"
      accessibilityLabel={LABEL}
      onPress={(event: MarkerPressEvent) => {
        // Without this the press also reaches `MapView`'s `onPress`, which
        // dismisses the very marker being taken up.
        event.stopPropagation();
        onTake(at);
      }}
    >
      <View style={styles.wrap} pointerEvents="none">
        <View style={styles.slot}>
          <View
            style={[
              styles.tile,
              { backgroundColor: palette.text, borderColor: palette.background },
            ]}
          >
            <View style={[styles.core, { backgroundColor: palette.background }]} />
          </View>
        </View>

        <View
          style={[
            styles.pill,
            { backgroundColor: palette.background, borderColor: palette.border },
          ]}
        >
          <Text style={[styles.pillText, { color: palette.text }]}>{LABEL}</Text>
        </View>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  wrap: { width: WIDTH, alignItems: 'center' },
  slot: { height: SLOT, justifyContent: 'center' },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: TILE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  core: { width: 8, height: 8, borderRadius: 4 },
  pill: {
    marginTop: GAP,
    height: PILL_HEIGHT,
    paddingHorizontal: 12,
    borderRadius: PILL_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { fontSize: 13, fontWeight: '600' },
});
