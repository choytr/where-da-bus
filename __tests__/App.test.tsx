import { act, cleanup, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppShell } from '../AppShell';
import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheBus } from '../data/thebus';
import { SCHEMA_VERSION } from '../data/gtfs/sql';

/**
 * A generation name of *this* binary's schema. Written as a literal here once
 * and it was wrong the moment SCHEMA_VERSION moved: the app now refuses a
 * pointer naming another schema's file, so these tests silently became tests
 * of the fallback instead of tests of the pointer.
 */
const GENERATION = `gtfs-v${SCHEMA_VERSION}-20260810T120000Z.db`;

/**
 * What this file owns is the gate in front of the stop list: the bundled
 * database is opened read-only, and the three outcomes of that open —
 * running, opened, failed — each reach the user as something different. The
 * screen behind the gate has its own tests.
 *
 * A child is passed in rather than reached through the router. `AppShell`
 * takes children precisely so this suite does not have to stand up Expo Router
 * to test a database gate.
 *
 * That child used to be `HomeScreen`, on the grounds that a real screen calls
 * `useSafeAreaInsets` where a stub would not — which is what makes the
 * safe-area guard below bite. `HomeScreen` was retired at the end of Increment
 * 3, and its successor `StopsScreen` reads the safe area through `SafeAreaView`
 * instead, which does **not** throw without a provider. So the guard is stated
 * directly now: `InsetReader` exists to call the one hook whose missing
 * provider is a real, silent, device-only bug. That is more honest than relying
 * on a screen to keep calling it by accident.
 *
 * `expo-sqlite` is a native module, so `SQLiteProvider` is doubled and driven
 * through each outcome by hand. Its props are read back through
 * `jest.requireMock`, which Jest types as `any` for exactly this
 * partial-native-double case, so no type assertion is written to call a
 * two-method stub where the real `SQLiteDatabase` is declared (the same
 * reasoning as data/gtfs/__tests__/db.test.ts).
 */
jest.mock('expo-sqlite', () => ({
  SQLiteProvider: jest.fn(),
  useSQLiteContext: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

/**
 * The background refresh, doubled — the real one would reach GitHub from a unit
 * test. Its own behaviour is covered in data/gtfs/__tests__/dataRefresh.test.ts;
 * what this file owns is that the shell *starts* it, which is the part no other
 * suite can see.
 */
jest.mock('../data/gtfs/dataRefresh', () => ({
  refreshStopData: jest.fn(async () => ({ state: 'up-to-date' })),
  sweepStaleGenerations: jest.fn(async () => {}),
}));

/**
 * The SQLite directory listing, doubled.
 *
 * `AppShell` now asks whether the file its pointer names is actually there,
 * because `openDatabaseAsync` *creates* what it cannot find — so an absent
 * generation opens as an empty database, the gate never fires, and every screen
 * silently shows nothing. That check is the only reason `data/gtfs/files.ts` is
 * in the shell's module graph at all.
 *
 * Doubling the module rather than `expo-file-system` keeps the real one from
 * loading here: it reaches `expo-sqlite` at import time, which is not resolvable
 * from the project root under Jest (see the `expo-asset` note in
 * docs/handoff.md).
 *
 * The default is a directory holding only the floor, which is what a fresh
 * install looks like.
 */
let mockDatabaseDirectory: string[] = ['gtfs.db'];
let mockListFails = false;
jest.mock('../data/gtfs/files', () => ({
  databaseFiles: {
    list: jest.fn(() => {
      if (mockListFails) throw new Error('database directory could not be listed');
      return mockDatabaseDirectory;
    }),
  },
}));

/**
 * The keychain, which has no native module under Jest.
 *
 * Most of this file is about the *database* gate, and `KeyGate` now stands in
 * front of it — with no key, the shell renders onboarding and never opens a
 * database at all. So a key is seeded here to put the shell in the state these
 * tests are about, and the gate's own behaviour is asserted separately at the
 * bottom rather than left implicit in a seed.
 */
let mockStoredKey: string | null = '3f7c1e92-8a4b-4d16-9f03-c5e28b71da40';
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => mockStoredKey),
  setItemAsync: jest.fn(async (_key: string, value: string) => {
    mockStoredKey = value;
  }),
  deleteItemAsync: jest.fn(async () => {
    mockStoredKey = null;
  }),
}));

/**
 * `initialWindowMetrics` is read from the native module at import time and is
 * `null` off-device. A `SafeAreaProvider` seeded with `null` renders its
 * children only once native reports the window — which never happens under
 * Jest — so the whole tree would come back empty and every assertion below
 * would fail for a reason that has nothing to do with the database gate.
 * Substituting a real device's metrics is what native would have supplied.
 */
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  initialWindowMetrics: {
    frame: { x: 0, y: 0, width: 393, height: 852 },
    insets: { top: 59, left: 0, right: 0, bottom: 34 },
  },
}));

/**
 * `GestureHandlerRootView` calls into a native module at render — off-device
 * that throws `RNGestureHandlerModule.default.install is not a function`, which
 * takes the whole shell down before any assertion runs.
 *
 * It is substituted with a labelled `View` rather than silenced, so the guard
 * below can assert the root is actually there. Gesture handling is the same
 * class of problem as safe-area insets: resolved through a *native* container,
 * silent when the container is missing, and only visible on a device — where
 * the symptom is a bottom sheet that simply will not drag.
 */
jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  return {
    GestureHandlerRootView: ({ children, style }: { children: unknown; style: unknown }) => (
      <View accessibilityLabel="gesture root" style={style}>
        {children}
      </View>
    ),
  };
});

/**
 * The whole child. It calls `useSafeAreaInsets`, which throws without a
 * provider — see CLAUDE.md — and renders a marker the gate's tests can look
 * for. Do not replace this with something that does not call that hook.
 */
function InsetReader() {
  useSafeAreaInsets();
  return <Text>inside the shell</Text>;
}

/**
 * The same shape of guard, for `TheBusProvider`. `useTheBus` throws without
 * one, and every screen that asks for arrivals now calls it through the route
 * that mounts it — so a provider removed from `AppShell` breaks the whole app
 * on a device while the rest of this file stays green.
 */
function ClientReader() {
  useTheBus();
  return <Text>read the client</Text>;
}

/**
 * A screen that crashes while rendering — which is the whole point of the
 * boundary split. Before it, this landed on "Stop data unavailable…
 * Reinstalling the app is the usual fix", which is confidently wrong advice
 * *and* destroys the evidence: the map crash in docs/backlog.md would be
 * reported to the user as a database problem.
 */
function Boom(): never {
  throw new Error('a screen crashed while rendering');
}

const sqlite = () => jest.requireMock('expo-sqlite');

describe('AppShell', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    // `clearAllMocks` resets call records, not the storage mock's contents, so
    // the generation-pointer tests below would otherwise leave a pointer set
    // for every test after them and none of them would open the floor.
    await AsyncStorage.clear();
    // Reset, so the two gate tests below cannot leak a null key into whichever
    // test happens to run next.
    mockStoredKey = '3f7c1e92-8a4b-4d16-9f03-c5e28b71da40';
    mockDatabaseDirectory = ['gtfs.db'];
    mockListFails = false;
    sqlite().SQLiteProvider.mockImplementation((props: { children: unknown }) => props.children);
    sqlite().useSQLiteContext.mockReturnValue({
      getAllAsync: jest.fn(async () => []),
      getFirstAsync: jest.fn(async () => null),
    });
  });

  it('renders its children once the database is open', async () => {
    await render(<AppShell><InsetReader /></AppShell>);
    await waitFor(() => screen.getByText('inside the shell'));
  });

  /**
   * The guard on the safe-area provider (see CLAUDE.md). `InsetReader` calls
   * `useSafeAreaInsets`, which throws without a provider, so removing
   * `SafeAreaProvider` from `AppShell` fails the suite.
   *
   * This assertion exists because of *how* it would otherwise fail. The throw
   * is swallowed by an error boundary, so the test above just times out in
   * `waitFor` — the same test name and the same failure shape as the
   * cold-cache flake in docs/backlog.md, which trains a reader to dismiss it.
   * Naming the wrong screen makes the real cause legible.
   *
   * **Which screen that is changed with the boundary split.** `InsetReader` is
   * a child, so its throw now lands on the nearer `AppErrorGate` and shows
   * "Something went wrong" — no longer the database screen. Both are asserted:
   * the database one so this keeps proving the split has not quietly regressed,
   * and the new one so the guard still names the real cause. Verified by
   * removing the provider and watching five tests fail, not by reading.
   */
  it('renders its children rather than an error screen', async () => {
    await render(<AppShell><InsetReader /></AppShell>);
    await waitFor(() => screen.getByText('inside the shell'));
    expect(screen.queryByText(/stop data unavailable/i)).toBeNull();
    expect(screen.queryByText(/something went wrong/i)).toBeNull();
  });

  /**
   * The companion to the safe-area guard above, and it has to be an explicit
   * assertion for the opposite reason: a missing gesture root does not throw
   * under Jest at all once the module is mocked, so nothing else in this file
   * would notice its removal. On a device the cost is a sheet that does not
   * respond to a drag, with no error anywhere.
   */
  it('wraps the app in a gesture root, which the map sheet cannot drag without', async () => {
    await render(<AppShell><InsetReader /></AppShell>);
    screen.getByLabelText('gesture root');
  });

  /**
   * Explicit for the same reason as the two above: the throw is swallowed by
   * `DatabaseGate`, so losing the provider would surface as a `waitFor` timeout
   * that reads like the cold-cache flake rather than like a missing provider.
   */
  it('mounts the client provider, without which every arrivals view throws', async () => {
    await render(<AppShell><ClientReader /></AppShell>);
    await waitFor(() => screen.getByText('read the client'));
    expect(screen.queryByText(/stop data unavailable/i)).toBeNull();
  });

  it('opens the bundled database read-only', async () => {
    await render(<AppShell><InsetReader /></AppShell>);

    const props = sqlite().SQLiteProvider.mock.calls[0][0];
    const db = { execAsync: jest.fn(async () => {}) };
    await props.onInit(db);

    expect(db.execAsync).toHaveBeenCalledWith('PRAGMA query_only = ON;');
  });

  it('re-copies the bundled asset rather than trusting an older copy on disk', async () => {
    await render(<AppShell><InsetReader /></AppShell>);

    const props = sqlite().SQLiteProvider.mock.calls[0][0];
    expect(props.assetSource.forceOverwrite).toBe(true);
  });

  it('opens the downloaded generation once one has been installed', async () => {
    await AsyncStorage.setItem(
      'gtfs.current.v1',
      JSON.stringify({ file: GENERATION, builtAt: '2026-08-10T12:00:00Z' }),
    );
    mockDatabaseDirectory = ['gtfs.db', GENERATION];

    await render(<AppShell><InsetReader /></AppShell>);

    await waitFor(() => {
      const props = sqlite().SQLiteProvider.mock.calls.at(-1)[0];
      expect(props.databaseName).toBe(GENERATION);
    });
  });

  /**
   * The bundle can supply `gtfs.db` and nothing else, so naming `assetSource`
   * while opening a generation asks expo-sqlite to import the bundled asset
   * over the newer file — and `forceOverwrite` makes that certain rather than
   * occasional. Every refresh would be undone on the next launch, and the app
   * would look like it was simply never updating.
   */
  it('does not name the bundled asset while opening a generation', async () => {
    await AsyncStorage.setItem(
      'gtfs.current.v1',
      JSON.stringify({ file: GENERATION, builtAt: '2026-08-10T12:00:00Z' }),
    );
    mockDatabaseDirectory = ['gtfs.db', GENERATION];

    await render(<AppShell><InsetReader /></AppShell>);

    await waitFor(() => {
      const props = sqlite().SQLiteProvider.mock.calls.at(-1)[0];
      expect(props.databaseName).not.toBe('gtfs.db');
      expect(props.assetSource).toBeUndefined();
    });
  });

  /**
   * The worst failure shape in the app, and the reason this check exists at
   * all: `openDatabaseAsync` **creates** a database it cannot find. So a
   * pointer naming a file that is gone — swept by the losing side of a race,
   * or lost to an OS cache eviction — opens an empty one *successfully*. The
   * gate never fires, nothing throws, nothing is logged, and every screen in
   * the app quietly reports that Oahu has no bus stops.
   *
   * The floor is in the bundle precisely so this degrades to stale data.
   */
  it('falls back to the bundled database when the stored pointer names a file that is not there', async () => {
    await AsyncStorage.setItem(
      'gtfs.current.v1',
      JSON.stringify({ file: GENERATION, builtAt: '2026-08-10T12:00:00Z' }),
    );
    // The pointer survived; the file did not.
    mockDatabaseDirectory = ['gtfs.db'];

    await render(<AppShell><InsetReader /></AppShell>);

    await waitFor(() => screen.getByText('inside the shell'));
    const props = sqlite().SQLiteProvider.mock.calls.at(-1)[0];
    expect(props.databaseName).toBe('gtfs.db');
    // And it must arrive by the floor's own path, or the copy never happens.
    expect(props.assetSource.forceOverwrite).toBe(true);
  });

  /**
   * The upgrade path a sideloaded install actually takes. A binary going from
   * schema v1 to v2 finds a stored pointer at a `gtfs-v1-…` generation that is
   * still on disk and still opens — and every query the new schema added then
   * fails with "no such table", with the pointer, the file and its checksum all
   * perfectly in order. The floor is a database this binary is certain it can
   * read, so it wins.
   */
  it('falls back to the bundled database when the pointer names another schema’s generation', async () => {
    const older = 'gtfs-v1-20260810T120000Z.db';
    await AsyncStorage.setItem(
      'gtfs.current.v1',
      JSON.stringify({ file: older, builtAt: '2026-08-10T12:00:00Z' }),
    );
    // The file is right there, which is exactly what makes this dangerous.
    mockDatabaseDirectory = ['gtfs.db', older];

    await render(<AppShell><InsetReader /></AppShell>);

    await waitFor(() => screen.getByText('inside the shell'));
    const props = sqlite().SQLiteProvider.mock.calls.at(-1)[0];
    expect(props.databaseName).toBe('gtfs.db');
    expect(props.assetSource.forceOverwrite).toBe(true);
  });

  it('opens the stored generation when it exists', async () => {
    await AsyncStorage.setItem(
      'gtfs.current.v1',
      JSON.stringify({ file: GENERATION, builtAt: '2026-08-10T12:00:00Z' }),
    );
    mockDatabaseDirectory = ['gtfs.db', GENERATION];

    await render(<AppShell><InsetReader /></AppShell>);

    await waitFor(() => {
      const props = sqlite().SQLiteProvider.mock.calls.at(-1)[0];
      expect(props.databaseName).toBe(GENERATION);
    });
    // The distinguishing assertion: the directory was actually consulted,
    // rather than the name being taken on the pointer's word as before.
    expect(jest.requireMock('../data/gtfs/files').databaseFiles.list).toHaveBeenCalled();
  });

  /**
   * The check is an optimisation on trust, not a prerequisite. If the directory
   * cannot be listed the app still has to open something, and the floor is the
   * answer that is always available — the same reasoning as the unreadable
   * pointer above.
   */
  it('falls back when listing the directory throws', async () => {
    await AsyncStorage.setItem(
      'gtfs.current.v1',
      JSON.stringify({ file: GENERATION, builtAt: '2026-08-10T12:00:00Z' }),
    );
    mockListFails = true;

    await render(<AppShell><InsetReader /></AppShell>);

    await waitFor(() => screen.getByText('inside the shell'));
    const props = sqlite().SQLiteProvider.mock.calls.at(-1)[0];
    expect(props.databaseName).toBe('gtfs.db');
  });

  /**
   * A pointer that will not parse costs one stale launch, not a dead app. The
   * floor is a database that definitely exists, which is the entire reason it
   * is still in the bundle.
   */
  it('falls back to the bundled floor when the pointer is unreadable', async () => {
    await AsyncStorage.setItem('gtfs.current.v1', 'not json at all');

    await render(<AppShell><InsetReader /></AppShell>);

    await waitFor(() => screen.getByText('inside the shell'));
    const props = sqlite().SQLiteProvider.mock.calls.at(-1)[0];
    expect(props.databaseName).toBe('gtfs.db');
  });

  /**
   * The launch check is fire-and-forget with no screen of its own, so nothing
   * else in the app would notice it never being started. On a device the cost
   * is stop data that silently stops refreshing — which looks exactly like the
   * bug this whole increment exists to fix.
   *
   * Fake timers are swapped back only after `cleanup()`, because RNTL registers
   * its auto-cleanup as a top-level `afterEach` that runs *after* this — so the
   * shell would still be mounted, and its scheduled callback still pending,
   * while real timers came back. See CLAUDE.md.
   *
   * **`doNotFake` is load-bearing, and its absence does not fail this test.**
   * React Native's async `act` and the AsyncStorage mock both resolve through
   * `setImmediate`. Faking it in one test of a suite whose other tests run on
   * real timers leaves the renderer wedged after this one unmounts: the next
   * test to render times out in `waitFor`, and the one after that hangs the
   * whole run with no output at all. This test passed alone the entire time it
   * was breaking the eleven that follow it.
   */
  it('looks for newer stop data shortly after the app is usable, not before', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'queueMicrotask', 'nextTick'] });
    const refresh = jest.requireMock('../data/gtfs/dataRefresh');

    try {
      await render(<AppShell><InsetReader /></AppShell>);

      // The first seconds of a launch already hold a location fix, a map and
      // the first arrivals request. This is not what the rider is waiting for.
      expect(refresh.refreshStopData).not.toHaveBeenCalled();

      // Advanced synchronously inside an async act: advanceTimersByTimeAsync
      // awaits inside its calling act scope and trips React's overlapping-act
      // guard.
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      // The sweep runs first, on the launch after the pointer moved off the
      // previous generation, when nothing holds it open.
      expect(refresh.sweepStaleGenerations).toHaveBeenCalled();
      expect(refresh.refreshStopData).toHaveBeenCalled();
    } finally {
      await cleanup();
      jest.useRealTimers();
    }
  });

  /**
   * Started concurrently these two race, and the losing outcome is the worst
   * state this increment can produce. The sweep deletes every generation the
   * pointer does not name; the refresh saves the pointer only after renaming
   * the file into place. A sweep landing between the two deletes the file the
   * pointer is about to name — and the next launch opens an *empty* database
   * there, because `openDatabaseAsync` creates what it cannot find. That open
   * succeeds, so `DatabaseGate` never fires and every screen silently shows
   * nothing.
   */
  it('does not start the refresh until the sweep has finished', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'queueMicrotask', 'nextTick'] });
    const refresh = jest.requireMock('../data/gtfs/dataRefresh');

    let sweepDone = () => {};
    refresh.sweepStaleGenerations.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          sweepDone = resolve;
        }),
    );

    try {
      await render(<AppShell><InsetReader /></AppShell>);
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      expect(refresh.sweepStaleGenerations).toHaveBeenCalled();
      expect(refresh.refreshStopData).not.toHaveBeenCalled();

      await act(async () => {
        sweepDone();
      });

      expect(refresh.refreshStopData).toHaveBeenCalled();
    } finally {
      await cleanup();
      jest.useRealTimers();
    }
  });

  it('says it is opening the database while the open is still running', async () => {
    // Suspending forever is how a slow open looks to React: the fallback is
    // what the user sits in front of, and it must not be a blank screen.
    const pending = new Promise(() => {});
    sqlite().SQLiteProvider.mockImplementation(() => {
      throw pending;
    });

    await render(<AppShell><InsetReader /></AppShell>);
    screen.getByText(/opening stop data/i);
    expect(screen.queryByText(/could not be opened/i)).toBeNull();
  });

  it('explains a failed database open instead of crashing', async () => {
    // React reports an error to console.error even when a boundary catches
    // it; silenced here so the suite output stays honest about real problems.
    const reported = jest.spyOn(console, 'error').mockImplementation(() => {});
    sqlite().SQLiteProvider.mockImplementation(() => {
      throw new Error('file is not a database');
    });

    await render(<AppShell><InsetReader /></AppShell>);

    screen.getByText(/stop data unavailable/i);
    screen.getByText(/could not be opened/i);
    expect(screen.queryByPlaceholderText(/stop number or name/i)).toBeNull();
    expect(reported).toHaveBeenCalled();
    reported.mockRestore();
  });

  /**
   * The other side of the same split. A render error anywhere below the shell
   * is not evidence about the database, and telling the user to reinstall over
   * one is both wrong and expensive — a reinstall throws away their API key,
   * their favorites and their downloaded generation to fix a bug that none of
   * those caused.
   */
  it('reports an unexpected error without blaming the stop data', async () => {
    const reported = jest.spyOn(console, 'error').mockImplementation(() => {});

    await render(<AppShell><Boom /></AppShell>);

    await screen.findByText(/something went wrong/i);
    expect(screen.queryByText(/stop data unavailable/i)).toBeNull();
    expect(screen.queryByText(/reinstall/i)).toBeNull();
    reported.mockRestore();
  });

  it('keeps the non-affiliation disclaimer on the failure screen', async () => {
    const reported = jest.spyOn(console, 'error').mockImplementation(() => {});
    sqlite().SQLiteProvider.mockImplementation(() => {
      throw new Error('file is not a database');
    });

    await render(<AppShell><InsetReader /></AppShell>);

    screen.getByText(/not affiliated with or endorsed by/i);
    reported.mockRestore();
  });

  /**
   * The key gate, asserted at the shell rather than only in its own file.
   * `KeyGate.test.tsx` proves the component works; this proves `AppShell`
   * actually mounts it, which is the part that would silently regress — and
   * the consequence of losing it is an install with no key showing a broken
   * arrival board instead of being asked for one.
   */
  it('asks for a key instead of opening the app when none is stored', async () => {
    mockStoredKey = null;

    await render(<AppShell><InsetReader /></AppShell>);

    await screen.findByText('Add your API key');
    expect(screen.queryByText('inside the shell')).toBeNull();
  });

  it('does not open the database at all until there is a key', async () => {
    // The gate sits outside SQLiteProvider on purpose: with no key there is no
    // app to open a database for, so a first launch goes straight to asking.
    mockStoredKey = null;

    await render(<AppShell><InsetReader /></AppShell>);

    await screen.findByText('Add your API key');
    expect(sqlite().SQLiteProvider).not.toHaveBeenCalled();
  });
});
