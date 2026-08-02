import { render, screen, waitFor } from '@testing-library/react-native';
import { AppShell } from '../AppShell';
import { HomeScreen } from '../features/stops/HomeScreen';

/**
 * What this file owns is the gate in front of the stop list: the bundled
 * database is opened read-only, and the three outcomes of that open —
 * running, opened, failed — each reach the user as something different. The
 * screen behind the gate has its own tests.
 *
 * `HomeScreen` is passed in as the child rather than being reached through
 * the router. `AppShell` takes children precisely so this suite does not have
 * to stand up Expo Router to test a database gate — and passing the real
 * screen is what keeps the safe-area guard below meaningful, since a stub
 * child would not call `useSafeAreaInsets` and the missing provider would go
 * unnoticed.
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

const sqlite = () => jest.requireMock('expo-sqlite');

describe('AppShell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sqlite().SQLiteProvider.mockImplementation((props: { children: unknown }) => props.children);
    sqlite().useSQLiteContext.mockReturnValue({
      getAllAsync: jest.fn(async () => []),
      getFirstAsync: jest.fn(async () => null),
    });
  });

  it('shows the stop list once the database is open', async () => {
    await render(<AppShell><HomeScreen /></AppShell>);
    await waitFor(() => screen.getByPlaceholderText(/stop number or name/i));
  });

  /**
   * The guard on the safe-area provider (see CLAUDE.md). `HomeScreen` calls
   * `useSafeAreaInsets`, which throws without a provider, so removing
   * `SafeAreaProvider` from `App` fails the suite.
   *
   * This assertion exists because of *how* it would otherwise fail. The throw
   * is swallowed by `DatabaseGate`, so the test above just times out in
   * `waitFor` — the same test name and the same failure shape as the
   * cold-cache flake in docs/backlog.md, which trains a reader to dismiss it.
   * Naming the wrong screen makes the real cause legible.
   */
  it('renders the stop list rather than the database-failure screen', async () => {
    await render(<AppShell><HomeScreen /></AppShell>);
    await waitFor(() => screen.getByPlaceholderText(/stop number or name/i));
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
    await render(<AppShell><HomeScreen /></AppShell>);
    screen.getByLabelText('gesture root');
  });

  it('opens the bundled database read-only', async () => {
    await render(<AppShell><HomeScreen /></AppShell>);

    const props = sqlite().SQLiteProvider.mock.calls[0][0];
    const db = { execAsync: jest.fn(async () => {}) };
    await props.onInit(db);

    expect(db.execAsync).toHaveBeenCalledWith('PRAGMA query_only = ON;');
  });

  it('re-copies the bundled asset rather than trusting an older copy on disk', async () => {
    await render(<AppShell><HomeScreen /></AppShell>);

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

    await render(<AppShell><HomeScreen /></AppShell>);
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

    await render(<AppShell><HomeScreen /></AppShell>);

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

    await render(<AppShell><HomeScreen /></AppShell>);

    screen.getByText(/not affiliated with or endorsed by/i);
    reported.mockRestore();
  });
});
