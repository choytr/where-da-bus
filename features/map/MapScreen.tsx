import { StyleSheet, View } from 'react-native';
import MapView from 'react-native-maps';

/**
 * Task 7: a bare map and nothing else. Pins, the anchored stop set and the
 * bottom sheet are tasks 8–10.
 *
 * It is deliberately this empty. This is the first thing in the increment that
 * can fail *natively* — `react-native-maps` renders an `MKMapView`, which Jest
 * cannot exercise and about which no amount of green suite proves anything. If
 * a map is going to fail to appear, it should fail here, with nothing else on
 * screen to confuse the question.
 *
 * No attribution line yet: what is on screen is Apple's tiles, not the
 * provider's data. It arrives with the stops in task 9, at the top of the
 * sheet.
 */

/**
 * Downtown Honolulu, with the whole island in view. Only the starting camera —
 * task 8 replaces it with the rider's location where that is known and keeps
 * this as the fallback when permission is denied.
 */
const HONOLULU = {
  latitude: 21.3069,
  longitude: -157.8583,
  latitudeDelta: 0.35,
  longitudeDelta: 0.35,
};

export function MapScreen() {
  return (
    // No SafeAreaView. A map is one of the few things that should run under the
    // status bar and behind the tab bar; insetting it would leave grey bars top
    // and bottom. What sits *on* the map — the recentre button, the sheet —
    // takes the insets instead, in task 9.
    <View style={styles.fill}>
      <MapView style={styles.fill} initialRegion={HONOLULU} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
