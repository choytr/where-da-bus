import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../lib/theme';
import { ATTRIBUTION } from '../../lib/legal';

/**
 * Placeholder until task 7 installs react-native-maps. It exists now so the
 * tab bar has three real destinations to verify, and so the map arrives as a
 * change to one file rather than a new tab plus a new screen at once.
 */
export function MapScreen() {
  const { palette } = useTheme();

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: palette.background }]}>
      <View style={styles.center}>
        <Text style={[styles.title, { color: palette.text }]}>Map</Text>
        <Text style={[styles.body, { color: palette.muted }]}>
          Nearby stops will appear here.
        </Text>
        <Text style={[styles.legal, { color: palette.muted }]}>{ATTRIBUTION}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  title: { fontSize: 20, fontWeight: '600' },
  body: { fontSize: 15 },
  legal: { fontSize: 11, lineHeight: 15, textAlign: 'center', marginTop: 12 },
});
