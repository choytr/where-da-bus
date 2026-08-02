import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView from 'react-native-maps';
import { useAnchoredStops } from './useAnchoredStops';

/**
 * The map, anchored to one point. Pins and the bottom sheet are tasks 9 and 10;
 * what this file owns today is the camera and where it is pointed.
 *
 * No attribution line yet: what is on screen is Apple's tiles, not the
 * provider's data. It arrives with the stops in task 9, at the top of the
 * sheet.
 */

export function MapScreen() {
  const { region } = useAnchoredStops();
  const map = useRef<MapView | null>(null);

  /**
   * `initialRegion` is read once at mount and ignored afterwards, so moving the
   * camera later has to be an imperative call. Animating rather than snapping
   * because the anchor only moves when the rider caused it to — a tap, or a
   * recentre — and an animation is what tells them the map understood which.
   *
   * `region` is memoised on the anchor inside `useAnchoredStops`, so its
   * identity changes exactly when the anchor does and nothing else needs to be
   * listed here.
   */
  useEffect(() => {
    map.current?.animateToRegion(region, 350);
  }, [region]);

  return (
    // No SafeAreaView. A map is one of the few things that should run under the
    // status bar and behind the tab bar; insetting it would leave grey bars top
    // and bottom. What sits *on* the map — the recentre button, the sheet —
    // takes the insets instead, in task 9.
    <View style={styles.fill}>
      <MapView ref={map} style={styles.fill} initialRegion={region} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
