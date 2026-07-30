import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, Text, useColorScheme, View } from 'react-native';

/**
 * Increment 0 — pipeline smoke screen.
 *
 * This screen exists to answer one question: did the build produced on a
 * GitHub Actions macOS runner actually reach the phone? It shows values that
 * can only come from a real device, so a successful sideload is unambiguous.
 *
 * Replaced entirely in Increment 1.
 */

const BUILD_MARKER = 'increment-0';

export default function App() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const theme = isDark ? darkTheme : lightTheme;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>TheBus Oahu</Text>
      <Text style={[styles.subtitle, { color: theme.muted }]}>
        Pipeline check
      </Text>

      <View style={[styles.card, { borderColor: theme.border }]}>
        <Row label="Build" value={BUILD_MARKER} theme={theme} />
        <Row label="Platform" value={Platform.OS} theme={theme} />
        <Row label="OS version" value={String(Platform.Version)} theme={theme} />
        <Row
          label="Color scheme"
          value={scheme ?? 'unknown'}
          theme={theme}
        />
      </View>

      <Text style={[styles.footer, { color: theme.muted }]}>
        Not affiliated with or endorsed by Oahu Transit Services, Inc.
      </Text>

      <StatusBar style={isDark ? 'light' : 'dark'} />
    </View>
  );
}

type Theme = {
  background: string;
  text: string;
  muted: string;
  border: string;
};

function Row({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: Theme;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

const lightTheme: Theme = {
  background: '#ffffff',
  text: '#11181c',
  muted: '#687076',
  border: '#e6e8eb',
};

const darkTheme: Theme = {
  background: '#101314',
  text: '#ecedee',
  muted: '#9ba1a6',
  border: '#2a2f31',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 15,
    marginTop: 4,
    marginBottom: 28,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  rowLabel: {
    fontSize: 15,
  },
  rowValue: {
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  footer: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 28,
    maxWidth: 300,
  },
});
