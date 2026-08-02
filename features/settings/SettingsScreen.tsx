import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../lib/theme';

/** Placeholder; task 6 gives this the theme control, feed status and legal text. */
export function SettingsScreen() {
  const { palette } = useTheme();

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: palette.background }]}>
      <View style={styles.center}>
        <Text style={[styles.title, { color: palette.text }]}>Settings</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  title: { fontSize: 20, fontWeight: '600' },
});
