import { Component, Suspense, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { DISCLAIMER, HomeScreen } from './features/stops/HomeScreen';

/**
 * Increment 1 — the app root: the bundled GTFS database, then the stop list.
 *
 * `SQLiteProvider` copies `assets/db/gtfs.db` into the app's database
 * directory before opening it, so the three states of that copy-and-open —
 * running, opened, failed — are what this file is about. Everything after a
 * successful open is HomeScreen's problem.
 */

/**
 * The bundled database is reference data the app never writes: stop names,
 * codes, coordinates, and which routes serve which stop. `expo-sqlite`'s
 * `SQLiteOpenOptions` has no read-only flag (see NativeDatabase.d.ts — the
 * options are change listeners, connection reuse, statement finalisation and
 * libSQL), so read-only is enforced on the connection itself: `query_only`
 * makes SQLite reject any statement that would change the file, which turns a
 * stray write anywhere in the app into an immediate error instead of a
 * quietly diverging local copy.
 */
async function openReadOnly(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA query_only = ON;');
}

/**
 * `SafeAreaView` is a native view that finds its insets by walking *up the
 * native view tree* for an `RNCSafeAreaProvider` (see
 * ios/Fabric/RNCSafeAreaViewComponentView.mm, `findNearestProvider`). With no
 * provider that walk falls through to the view itself and the insets come back
 * zero — which put the search field under the Dynamic Island. The provider is
 * what makes the inset real, so it wraps everything, including the two states
 * that render before the database is open.
 *
 * `initialWindowMetrics` seeds the first frame from values the native side
 * already knows, so the screen does not paint once at zero inset and jump.
 */
export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  return (
    <DatabaseGate>
      <Suspense fallback={<Waiting />}>
        <SQLiteProvider
          databaseName="gtfs.db"
          // Re-copied from the bundle on every launch. The file on disk is a
          // disposable copy of reference data — never user state, which lives
          // in AsyncStorage — so overwriting it is what keeps a rebuilt feed
          // (npm run build:gtfs) from being shadowed by a stale first-launch
          // copy for the entire life of the install.
          assetSource={{ assetId: require('./assets/db/gtfs.db'), forceOverwrite: true }}
          onInit={openReadOnly}
          useSuspense
        >
          <HomeScreen />
        </SQLiteProvider>
      </Suspense>
      <StatusBar style="auto" />
    </DatabaseGate>
  );
}

/**
 * A failed open — a missing asset, a truncated copy, no room on the device —
 * rejects inside `SQLiteProvider`, and with `useSuspense` that rejection is
 * re-thrown during render. Without a boundary it takes the whole app down to
 * a red screen, so it is caught here and given an honest explanation instead.
 * `onError` is not an option: `SQLiteProvider` throws outright when it is
 * combined with `useSuspense` (see its source), and dropping suspense would
 * mean rendering nothing at all while the database opens.
 */
class DatabaseGate extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <Unavailable /> : this.props.children;
  }
}

function Waiting() {
  const palette = usePalette();
  return (
    <View style={[styles.center, { backgroundColor: palette.background }]}>
      <ActivityIndicator />
      <Text style={[styles.waitingText, { color: palette.muted }]}>Opening stop data…</Text>
    </View>
  );
}

function Unavailable() {
  const palette = usePalette();
  return (
    <View style={[styles.center, { backgroundColor: palette.background }]}>
      <Text style={[styles.title, { color: palette.text }]}>Stop data unavailable</Text>
      <Text style={[styles.body, { color: palette.muted }]}>
        The stop information bundled with this app could not be opened, so there is
        nothing to search or list. Reinstalling the app is the usual fix.
      </Text>
      <Text style={[styles.legal, { color: palette.muted }]}>{DISCLAIMER}</Text>
    </View>
  );
}

function usePalette() {
  return useColorScheme() === 'dark' ? dark : light;
}

const light = {
  background: '#ffffff',
  text: '#11181c',
  muted: '#687076',
};

const dark = {
  background: '#101314',
  text: '#ecedee',
  muted: '#9ba1a6',
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  waitingText: { fontSize: 14 },
  title: { fontSize: 20, fontWeight: '600', textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 21, textAlign: 'center', maxWidth: 320 },
  legal: { fontSize: 11, lineHeight: 15, textAlign: 'center', marginTop: 12 },
});
