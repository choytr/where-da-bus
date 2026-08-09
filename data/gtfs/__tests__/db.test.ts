import { renderHook } from '@testing-library/react-native';
import { useStopQueries } from '../db';
import { boundingBox } from '../sql';
import type { Stop } from '../types';

/**
 * `expo-sqlite` is a native module — there is no in-Jest SQLite engine to run
 * real queries against (that coverage lives in data/gtfs/__tests__/sql.test.mjs,
 * which runs the same SQL through node:sqlite against the real built database).
 * What this file owns is the binding layer above the SQL: box math wiring,
 * the FTS null-query short-circuit, and — most importantly — the runtime type
 * guards that stand in for `as Stop`/`as RouteSummary`. A mocked db lets a
 * malformed row be injected on purpose to prove the guard actually filters it.
 *
 * The real `SQLiteDatabase` interface has dozens of methods (execAsync,
 * prepareAsync, withTransactionAsync, ...); this file only ever needs two of
 * them. Rather than assert a two-method stub into that full interface — the
 * same "trust me" move as `as Stop` — the mock is read back through
 * `jest.requireMock`, which is typed `any` by Jest itself for exactly this
 * "partial native-module double" case, so no assertion is written here.
 */
jest.mock('expo-sqlite', () => ({
  useSQLiteContext: jest.fn(),
}));

function makeDb() {
  const db = {
    getAllAsync: jest.fn(),
    getFirstAsync: jest.fn(),
  };
  jest.requireMock('expo-sqlite').useSQLiteContext.mockReturnValue(db);
  return db;
}

function stop(overrides: Partial<Stop> = {}): Stop {
  return {
    stop_id: '1',
    stop_code: '100',
    stop_name: 'Ala Moana Center',
    lat: 21.29,
    lon: -157.84,
    ...overrides,
  };
}

describe('useStopQueries.nearby', () => {
  it('sorts results by distance from the given center', async () => {
    const db = makeDb();
    const near = stop({ stop_id: 'near', lat: 21.3, lon: -157.85 });
    const far = stop({ stop_id: 'far', lat: 21.5, lon: -157.85 });
    db.getAllAsync.mockResolvedValue([far, near]);

    const { result } = await renderHook(() => useStopQueries());
    const rows = await result.current.nearby({ lat: 21.3, lon: -157.85 });

    expect(rows.map((r) => r.stop_id)).toEqual(['near', 'far']);
    expect(rows[0].meters).toBeLessThan(rows[1].meters);
  });

  it('passes the computed bounding box to the query', async () => {
    const db = makeDb();
    db.getAllAsync.mockResolvedValue([]);
    const center = { lat: 21.3, lon: -157.85 };
    const box = boundingBox(center, 1500);

    const { result } = await renderHook(() => useStopQueries());
    await result.current.nearby(center);

    expect(db.getAllAsync).toHaveBeenCalledWith(
      expect.any(String),
      box.minLat,
      box.maxLat,
      box.minLon,
      box.maxLon,
    );
  });

  it('returns an empty list when the bounding box catches nothing', async () => {
    const db = makeDb();
    db.getAllAsync.mockResolvedValue([]);

    const { result } = await renderHook(() => useStopQueries());
    const rows = await result.current.nearby({ lat: 21.3, lon: -157.85 });

    expect(rows).toEqual([]);
  });

  it('filters out a row that does not match the Stop shape', async () => {
    const db = makeDb();
    db.getAllAsync.mockResolvedValue([stop(), { stop_id: 'bad' /* missing fields */ }]);

    const { result } = await renderHook(() => useStopQueries());
    const rows = await result.current.nearby({ lat: 21.3, lon: -157.85 });

    expect(rows.map((r) => r.stop_id)).toEqual(['1']);
  });
});

describe('useStopQueries.searchByName', () => {
  it('returns an empty list for empty input without querying the database', async () => {
    const db = makeDb();

    const { result } = await renderHook(() => useStopQueries());
    const rows = await result.current.searchByName('');

    expect(rows).toEqual([]);
    expect(db.getAllAsync).not.toHaveBeenCalled();
  });

  it('returns an empty list for input that reduces to nothing', async () => {
    const db = makeDb();

    const { result } = await renderHook(() => useStopQueries());
    const rows = await result.current.searchByName('***');

    expect(rows).toEqual([]);
    expect(db.getAllAsync).not.toHaveBeenCalled();
  });

  it('binds the escaped match text, not the raw query', async () => {
    const db = makeDb();
    db.getAllAsync.mockResolvedValue([stop()]);

    const { result } = await renderHook(() => useStopQueries());
    await result.current.searchByName('ala moana');

    expect(db.getAllAsync).toHaveBeenCalledWith(
      expect.any(String),
      '"ala"* "moana"*',
      30,
    );
  });

  it('returns an empty list for a query matching nothing', async () => {
    const db = makeDb();
    db.getAllAsync.mockResolvedValue([]);

    const { result } = await renderHook(() => useStopQueries());
    const rows = await result.current.searchByName('zzzznonexistent');

    expect(rows).toEqual([]);
  });
});

describe('useStopQueries.searchRoutes', () => {
  it('returns an empty list for empty input without querying the database', async () => {
    const db = makeDb();

    const { result } = await renderHook(() => useStopQueries());
    const rows = await result.current.searchRoutes('  ');

    expect(rows).toEqual([]);
    expect(db.getAllAsync).not.toHaveBeenCalled();
  });

  it('binds the escaped patterns, not the raw query', async () => {
    const db = makeDb();
    db.getAllAsync.mockResolvedValue([]);

    const { result } = await renderHook(() => useStopQueries());
    await result.current.searchRoutes('100%');

    // Substring twice for the two LIKEs, then the unescaped text for the `=`
    // in the ORDER BY, then the prefix, then the limit.
    expect(db.getAllAsync).toHaveBeenCalledWith(
      expect.any(String),
      '%100\\%%',
      '%100\\%%',
      '100%',
      '100\\%%',
      30,
    );
  });

  it('filters out a row that is not a route', async () => {
    const db = makeDb();
    db.getAllAsync.mockResolvedValue([
      { route_id: '26', short_name: '40', long_name: 'Honolulu-Makaha' },
      // A schema drift: `long_name` gone. The guard is what stands in for the
      // `as RouteSummary` this project does not write.
      { route_id: '81', short_name: '401' },
    ]);

    const { result } = await renderHook(() => useStopQueries());
    const rows = await result.current.searchRoutes('40');

    expect(rows.map((route) => route.route_id)).toEqual(['26']);
  });
});

describe('useStopQueries.searchByCode', () => {
  it('trims the code before binding it', async () => {
    const db = makeDb();
    db.getFirstAsync.mockResolvedValue(stop());

    const { result } = await renderHook(() => useStopQueries());
    await result.current.searchByCode('  100  ');

    expect(db.getFirstAsync).toHaveBeenCalledWith(expect.any(String), '100');
  });

  it('returns null when no stop matches', async () => {
    const db = makeDb();
    db.getFirstAsync.mockResolvedValue(null);

    const { result } = await renderHook(() => useStopQueries());
    const row = await result.current.searchByCode('nope');

    expect(row).toBeNull();
  });
});

describe('useStopQueries.stopsByIds', () => {
  it('returns an empty list without querying for an empty id list', async () => {
    const db = makeDb();

    const { result } = await renderHook(() => useStopQueries());
    const rows = await result.current.stopsByIds([]);

    expect(rows).toEqual([]);
    expect(db.getAllAsync).not.toHaveBeenCalled();
  });

  it('resolves whichever ids still exist, silently dropping the rest', async () => {
    const db = makeDb();
    // A favorite whose stop_id no longer exists after a feed rebuild: only
    // one of the two requested ids comes back.
    db.getAllAsync.mockResolvedValue([stop({ stop_id: 'still-here' })]);

    const { result } = await renderHook(() => useStopQueries());
    const rows = await result.current.stopsByIds(['still-here', 'gone']);

    expect(rows.map((r) => r.stop_id)).toEqual(['still-here']);
    expect(db.getAllAsync).toHaveBeenCalledWith(expect.any(String), 'still-here', 'gone');
  });
});

describe('useStopQueries.routesForStops', () => {
  it('groups one result set back onto the stops that were asked for', async () => {
    const db = makeDb();
    db.getAllAsync.mockResolvedValue([
      { stop_id: 'stop-a', route_id: 'A', short_name: '1', long_name: 'Route 1' },
      { stop_id: 'stop-a', route_id: 'B', short_name: '2', long_name: 'Route 2' },
    ]);

    const { result } = await renderHook(() => useStopQueries());
    const routes = await result.current.routesForStops(['stop-a', 'stop-b']);

    expect(routes.get('stop-a')).toEqual([
      { route_id: 'A', short_name: '1', long_name: 'Route 1' },
      { route_id: 'B', short_name: '2', long_name: 'Route 2' },
    ]);
    // Asked for, nothing came back: known to have no routes, not unknown.
    expect(routes.get('stop-b')).toEqual([]);
  });

  it('asks once for the whole list rather than once per stop', async () => {
    const db = makeDb();
    db.getAllAsync.mockResolvedValue([]);

    const { result } = await renderHook(() => useStopQueries());
    await result.current.routesForStops(['stop-a', 'stop-b', 'stop-c']);

    expect(db.getAllAsync).toHaveBeenCalledTimes(1);
    expect(db.getAllAsync).toHaveBeenCalledWith(
      expect.any(String),
      'stop-a',
      'stop-b',
      'stop-c',
    );
  });

  it('returns an empty map without querying for an empty id list', async () => {
    const db = makeDb();

    const { result } = await renderHook(() => useStopQueries());
    const routes = await result.current.routesForStops([]);

    expect(routes.size).toBe(0);
    expect(db.getAllAsync).not.toHaveBeenCalled();
  });

  it('filters out a row that does not match the RouteSummary shape', async () => {
    const db = makeDb();
    db.getAllAsync.mockResolvedValue([
      { stop_id: 'stop-a', route_id: 'A' /* missing short_name/long_name */ },
    ]);

    const { result } = await renderHook(() => useStopQueries());
    const routes = await result.current.routesForStops(['stop-a']);

    expect(routes.get('stop-a')).toEqual([]);
  });

  it('filters out a row with no stop to group it under', async () => {
    const db = makeDb();
    db.getAllAsync.mockResolvedValue([
      { route_id: 'A', short_name: '1', long_name: 'Route 1' /* no stop_id */ },
    ]);

    const { result } = await renderHook(() => useStopQueries());
    const routes = await result.current.routesForStops(['stop-a']);

    expect(routes.get('stop-a')).toEqual([]);
  });
});

describe('useStopQueries.feedEndDate', () => {
  it('returns the date the meta row carries', async () => {
    const db = makeDb();
    db.getFirstAsync.mockResolvedValue({ feed_end_date: '20260822' });

    const { result } = await renderHook(() => useStopQueries());

    expect(await result.current.feedEndDate()).toBe('20260822');
  });

  it('returns null when the build wrote no end date', async () => {
    // SQL NULL is a legitimate value here, not a failed guard.
    const db = makeDb();
    db.getFirstAsync.mockResolvedValue({ feed_end_date: null });

    const { result } = await renderHook(() => useStopQueries());

    expect(await result.current.feedEndDate()).toBeNull();
  });

  it('returns null when there is no meta row at all', async () => {
    const db = makeDb();
    db.getFirstAsync.mockResolvedValue(null);

    const { result } = await renderHook(() => useStopQueries());

    expect(await result.current.feedEndDate()).toBeNull();
  });

  it('returns null rather than a number when the column holds the wrong type', async () => {
    const db = makeDb();
    db.getFirstAsync.mockResolvedValue({ feed_end_date: 20260822 });

    const { result } = await renderHook(() => useStopQueries());

    expect(await result.current.feedEndDate()).toBeNull();
  });
});
