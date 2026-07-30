import { render, screen, waitFor } from '@testing-library/react-native';
import App from '../App';

/**
 * What this file owns is the gate in front of the stop list: the bundled
 * database is opened read-only, and the three outcomes of that open —
 * running, opened, failed — each reach the user as something different. The
 * screen behind the gate has its own tests.
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

const sqlite = () => jest.requireMock('expo-sqlite');

describe('App', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sqlite().SQLiteProvider.mockImplementation((props: { children: unknown }) => props.children);
    sqlite().useSQLiteContext.mockReturnValue({
      getAllAsync: jest.fn(async () => []),
      getFirstAsync: jest.fn(async () => null),
    });
  });

  it('shows the stop list once the database is open', async () => {
    await render(<App />);
    await waitFor(() => screen.getByPlaceholderText(/stop number or name/i));
  });

  it('opens the bundled database read-only', async () => {
    await render(<App />);

    const props = sqlite().SQLiteProvider.mock.calls[0][0];
    const db = { execAsync: jest.fn(async () => {}) };
    await props.onInit(db);

    expect(db.execAsync).toHaveBeenCalledWith('PRAGMA query_only = ON;');
  });

  it('re-copies the bundled asset rather than trusting an older copy on disk', async () => {
    await render(<App />);

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

    await render(<App />);
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

    await render(<App />);

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

    await render(<App />);

    screen.getByText(/not affiliated with or endorsed by/i);
    reported.mockRestore();
  });
});
