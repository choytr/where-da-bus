import { render, screen, waitFor } from '@testing-library/react-native';
import { AppShell } from '../AppShell';
import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheBus } from '../data/thebus';

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

const sqlite = () => jest.requireMock('expo-sqlite');

describe('AppShell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset, so the two gate tests below cannot leak a null key into whichever
    // test happens to run next.
    mockStoredKey = '3f7c1e92-8a4b-4d16-9f03-c5e28b71da40';
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
   * is swallowed by `DatabaseGate`, so the test above just times out in
   * `waitFor` — the same test name and the same failure shape as the
   * cold-cache flake in docs/backlog.md, which trains a reader to dismiss it.
   * Naming the wrong screen makes the real cause legible.
   */
  it('renders its children rather than the database-failure screen', async () => {
    await render(<AppShell><InsetReader /></AppShell>);
    await waitFor(() => screen.getByText('inside the shell'));
    expect(screen.queryByText(/stop data unavailable/i)).toBeNull();
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
