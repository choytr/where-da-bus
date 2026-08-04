import { Component, Suspense, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DISCLAIMER } from './lib/legal';
import { ThemeProvider, useTheme } from './lib/theme';
import { themeStorage } from './data/storage/preferences';
import { TheBusProvider } from './data/thebus';
import { apiKeyStorage } from './data/storage/apiKey';
import { BUNDLED_DATABASE, loadCurrentDatabase } from './data/storage/database';
import { refreshStopData, sweepStaleGenerations } from './data/gtfs/dataRefresh';
import { schedule } from './lib/schedule';
import { KeyGate } from './features/onboarding/KeyGate';

/**
 * Everything that must be true before any screen renders: the safe-area
 * provider, the bundled GTFS database opened read-only, and an honest screen
 * for each way that open can go wrong.
 *
 * `SQLiteProvider` copies `assets/db/gtfs.db` into the app's database
 * directory before opening it, so the three states of that copy-and-open —
 * running, opened, failed — are what this file is about. Everything after a
 * successful open is a screen's problem.
 *
 * This is deliberately *not* `app/_layout.tsx`. Taking `children` keeps it
 * renderable on its own, so `__tests__/App.test.tsx` can drive the three
 * outcomes above without standing up a router; `_layout.tsx` is the ten-line
 * file that puts a navigator inside it.
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
 * Which database file this launch opens: a downloaded generation, or the
 * bundled floor when there is no pointer yet or it could not be read.
 *
 * **Read once, and deliberately never re-read.** A refresh that completes
 * mid-session moves the pointer for the *next* launch rather than swapping the
 * file underneath a running app. That is not caution about SQLite — the
 * generation design makes the swap itself safe — it is about what is below this
 * provider: the router. Changing `databaseName` remounts `SQLiteProvider` and
 * every screen under it, so a rider halfway through reading an arrival board
 * would be thrown back to the home screen by a background download finishing.
 * Waiting one launch costs nothing; the floor and the new generation differ by
 * a few stop names.
 *
 * Null means still loading, which is one AsyncStorage read and shows the same
 * "Opening stop data…" the database open already shows.
 */
function useCurrentDatabaseName(): string | null {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCurrentDatabase()
      .then((current) => {
        if (!cancelled) setName(current?.file ?? BUNDLED_DATABASE);
      })
      // `loadCurrentDatabase` swallows its own failures, so this is belt to
      // braces — but a shell that never resolves would hang on the spinner
      // forever, and the floor is always a correct answer.
      .catch(() => {
        if (!cancelled) setName(BUNDLED_DATABASE);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return name;
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
 * It stays here, above the navigator, rather than being left to React
 * Navigation. Expo Router mounts its own provider, but relying on that would
 * make the inset depend on a transitive detail of a library this project does
 * not control — and the failure mode is silent, renders correctly under Jest,
 * and only appears as content beneath the Dynamic Island on a real phone.
 * Nesting a provider is supported and costs nothing; this project has paid for
 * that bug once already.
 *
 * `initialWindowMetrics` seeds the first frame from values the native side
 * already knows, so the screen does not paint once at zero inset and jump.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    /*
      Gestures need a root the same way insets need a provider: react-native-
      gesture-handler resolves touches through a native container, and without
      one the map's bottom sheet simply will not drag. Expo Router mounts its
      own, but this project does not depend on a transitive detail of a library
      it does not control for something whose failure mode is silent and only
      visible on a device — the same call, for the same reason, as the
      SafeAreaProvider below. Nesting is supported and costs nothing.
    */
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <ThemeProvider storage={themeStorage}>
          {/*
            Holds the user's AppID and the client built from it. Outside the
            database gate because the two are independent: the key comes from
            the keychain and the stop data from a bundled asset, so a device can
            have one and not the other, and each has its own screen to say so.
          */}
          <TheBusProvider storage={apiKeyStorage}>
            <DatabaseGate>
              {/*
                Inside the database gate so onboarding is themed and the status
                bar below still renders, but *outside* the SQLiteProvider: with
                no key there is no app to open a database for, so the copy and
                open never happen and the first launch goes straight to asking
                for a key.

                Above the router, which is the point. No screen can mount
                without a key, so "no key yet" never becomes a fourth state
                threaded through every view that shows data — the screens deal
                only with `unauthorized`, which is a different thing.
              */}
              <KeyGate>
                <Suspense fallback={<Waiting />}>
                  <StopData>{children}</StopData>
                </Suspense>
              </KeyGate>
              <ThemedStatusBar />
            </DatabaseGate>
          </TheBusProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * A moment, not a delay for its own sake. The first seconds of a launch already
 * hold a location fix, a map, and the first arrivals request; a 1.2 MB download
 * starting inside that window competes with the things the rider is waiting
 * for, and it is not waiting for this one.
 */
const REFRESH_DELAY_MS = 2000;

/**
 * Looks for a newer build of the stop data, in the background, after the app is
 * usable.
 *
 * **Never blocks anything.** There is already a working database open — the
 * floor at worst — so this is an upgrade rather than a prerequisite, and it has
 * no screen. Failure is silent apart from the "last checked" timestamp in
 * Settings: a modal about a background refresh that did not work would be
 * strictly worse than saying nothing, since nothing is broken and there is
 * nothing for the rider to do.
 *
 * The sweep goes first, and is the other half of never overwriting an open
 * database: generations accumulate precisely because a refresh refuses to reuse
 * a name, so the previous one is deleted here, on the launch after the pointer
 * moved off it, when nothing holds it open.
 *
 * **The two are sequenced, not merely ordered on the page.** Started
 * concurrently they race, and the losing outcome is the worst state this
 * increment can produce. The sweep deletes every generation the pointer does
 * not name; the refresh saves the pointer only *after* renaming the file into
 * place. A sweep whose `list()` falls between that rename and that save deletes
 * the very file the pointer is about to name — and the next launch then opens
 * an *empty* database at that name, because `openDatabaseAsync` creates what it
 * cannot find. That open succeeds, so `DatabaseGate` never fires and every
 * screen silently shows nothing. Awaiting the sweep costs a few filesystem
 * milliseconds and removes the window entirely.
 */
function useStopDataRefresh(): void {
  useEffect(
    () =>
      schedule(() => {
        // Already silent — `refreshStopData` records the attempt itself — but
        // an unhandled rejection from a fire-and-forget call would still reach
        // the console and, in a release build, look like a crash report.
        void sweepStaleGenerations()
          .then(() => refreshStopData())
          .catch(() => {});
      }, REFRESH_DELAY_MS),
    [],
  );
}

/**
 * Opens whichever generation this launch is pointed at.
 *
 * `assetSource` is on the floor path *only*. The bundle can supply `gtfs.db`
 * and nothing else, so naming it while opening a downloaded generation would
 * ask expo-sqlite to import the bundled asset over the newer file — undoing
 * every refresh on every launch. `forceOverwrite` is what makes that damage
 * certain rather than occasional, and it stays because the floor genuinely is
 * a disposable copy of reference data that must not be shadowed by a stale
 * first-launch copy.
 */
function StopData({ children }: { children: ReactNode }) {
  const databaseName = useCurrentDatabaseName();
  // Inside the suspense boundary, so the effect commits only once the database
  // is actually open — which is what makes the sweep safe: the generation being
  // kept is the one this provider has a handle on.
  useStopDataRefresh();
  if (databaseName === null) return <Waiting />;

  const floor = databaseName === BUNDLED_DATABASE;
  return (
    <SQLiteProvider
      databaseName={databaseName}
      assetSource={
        floor ? { assetId: require('./assets/db/gtfs.db'), forceOverwrite: true } : undefined
      }
      onInit={openReadOnly}
      useSuspense
    >
      {children}
    </SQLiteProvider>
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

/**
 * `style="auto"` asks the OS what appearance it is in, which stopped being the
 * right question once the app got its own preference. A user who picks Dark on
 * a light phone would get dark status-bar glyphs over a dark screen — invisible
 * clock, invisible battery. The theme's *resolved* scheme is the answer, and it
 * agrees with `auto` for everyone who has not overridden anything.
 */
function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
}

function Waiting() {
  const { palette } = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: palette.background }]}>
      <ActivityIndicator />
      <Text style={[styles.waitingText, { color: palette.muted }]}>Opening stop data…</Text>
    </View>
  );
}

function Unavailable() {
  const { palette } = useTheme();
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  waitingText: { fontSize: 14 },
  title: { fontSize: 20, fontWeight: '600', textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 21, textAlign: 'center', maxWidth: 320 },
  legal: { fontSize: 11, lineHeight: 15, textAlign: 'center', marginTop: 12 },
});
