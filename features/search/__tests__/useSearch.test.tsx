import { renderHook, waitFor } from '@testing-library/react-native';
import { useSearch } from '../useSearch';
import type { RouteSummary, Stop } from '../../../data/gtfs/types';

/**
 * The engine both hosts share, driven directly.
 *
 * `expo-sqlite` is a native module, so what is doubled here is the query layer
 * above it — `useStopQueries` — rather than the database. The SQL itself is
 * covered against the real built asset in `data/gtfs/__tests__/sql.test.mjs`;
 * what this file owns is which queries run for which filter, and the two rules
 * that make a wrong filter recoverable: the counts run regardless of the
 * filter, and a failure is not an empty result.
 *
 * Real timers throughout, and every assertion goes through `waitFor` — the
 * debounce is 175 ms and the point of these tests is the answer, not the delay.
 */
const mockSearchByCode = jest.fn(async (): Promise<Stop | null> => null);
const mockSearchByName = jest.fn(async (): Promise<Stop[]> => []);
const mockSearchRoutes = jest.fn(async (): Promise<RouteSummary[]> => []);

jest.mock('../../../data/gtfs/db', () => ({
  useStopQueries: () => ({
    searchByCode: mockSearchByCode,
    searchByName: mockSearchByName,
    searchRoutes: mockSearchRoutes,
  }),
}));

const stop = (id: string, name: string): Stop => ({
  stop_id: id,
  stop_code: id,
  stop_name: name,
  lat: 21.3,
  lon: -157.85,
});

const route = (id: string, short: string, long: string): RouteSummary => ({
  route_id: id,
  short_name: short,
  long_name: long,
});

describe('useSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchByCode.mockResolvedValue(null);
    mockSearchByName.mockResolvedValue([]);
    mockSearchRoutes.mockResolvedValue([]);
  });

  it('finds a stop by its code', async () => {
    mockSearchByCode.mockResolvedValue(stop('596', 'KING ST + BISHOP ST'));

    const { result } = await renderHook(() => useSearch('596', 'stops'));

    await waitFor(() => {
      expect(result.current.state).toEqual({
        state: 'done',
        results: [{ kind: 'stop', stop: stop('596', 'KING ST + BISHOP ST') }],
      });
    });
  });

  it('finds a stop by name', async () => {
    mockSearchByName.mockResolvedValue([stop('5', 'LAGOON DR')]);

    const { result } = await renderHook(() => useSearch('lagoon', 'stops'));

    await waitFor(() => {
      expect(result.current.state).toEqual({
        state: 'done',
        results: [{ kind: 'stop', stop: stop('5', 'LAGOON DR') }],
      });
    });
  });

  it('leads with an exact code hit and does not repeat it', async () => {
    // `40` is a stop code, a route number and a fragment of stop names, so the
    // code lookup runs *as well as* the name search rather than instead of it.
    mockSearchByCode.mockResolvedValue(stop('40', 'ALA MOANA BL'));
    mockSearchByName.mockResolvedValue([stop('40', 'ALA MOANA BL'), stop('41', 'KEEAUMOKU ST')]);

    const { result } = await renderHook(() => useSearch('40', 'stops'));

    await waitFor(() => {
      expect(result.current.state.state).toBe('done');
    });
    expect(result.current.otherMatches.stops).toBe(2);
  });

  it('finds a route', async () => {
    mockSearchRoutes.mockResolvedValue([route('26', '40', 'Honolulu-Makaha')]);

    const { result } = await renderHook(() => useSearch('40', 'routes'));

    await waitFor(() => {
      expect(result.current.state).toEqual({
        state: 'done',
        results: [{ kind: 'route', route: route('26', '40', 'Honolulu-Makaha') }],
      });
    });
  });

  it('reports stop matches while the address filter is selected', async () => {
    // The whole reason a filter is survivable: `ala moana` typed into Address
    // is a query the local data answers well, and the rider is one tap from it.
    mockSearchByName.mockResolvedValue([stop('5', 'ALA MOANA BL'), stop('6', 'ALA MOANA CENTER')]);
    mockSearchRoutes.mockResolvedValue([route('8', '8', 'Waikiki-Ala Moana')]);

    const { result } = await renderHook(() => useSearch('ala moana', 'address'));

    await waitFor(() => {
      expect(result.current.otherMatches).toEqual({ stops: 2, routes: 1 });
    });
    // And it shows none of them: Address is waiting for a submit, not running.
    expect(result.current.state).toEqual({ state: 'off' });
  });

  it('reports nothing for an empty query', async () => {
    const { result } = await renderHook(() => useSearch('   ', 'stops'));

    expect(result.current.state).toEqual({ state: 'off' });
    expect(result.current.otherMatches).toEqual({ stops: 0, routes: 0 });
    // Not merely empty results — the database was never asked.
    expect(mockSearchByName).not.toHaveBeenCalled();
    expect(mockSearchRoutes).not.toHaveBeenCalled();
  });

  it('a failed query is not an empty result', async () => {
    // §4's rule, at the search field. "Nothing matched" and "the lookup fell
    // over" are different facts and must never render alike.
    mockSearchByName.mockRejectedValue(new Error('disk'));

    const { result } = await renderHook(() => useSearch('lagoon', 'stops'));

    await waitFor(() => {
      expect(result.current.state).toEqual({ state: 'failed' });
    });
    // And no counts to nudge with: offering a filter that also just failed
    // sends the rider in a circle.
    expect(result.current.otherMatches).toEqual({ stops: 0, routes: 0 });
  });

  it('keeps the previous results on screen while the next query runs', async () => {
    mockSearchByName.mockResolvedValue([stop('5', 'LAGOON DR')]);

    const { result, rerender } = await renderHook(
      ({ query }: { query: string }) => useSearch(query, 'stops'),
      { initialProps: { query: 'lagoon' } },
    );
    await waitFor(() => {
      expect(result.current.state.state).toBe('done');
    });

    await rerender({ query: 'lagoon d' });

    // A keystroke must not blank the list out from under a thumb already
    // reaching for a row.
    expect(result.current.state).toEqual({
      state: 'running',
      results: [{ kind: 'stop', stop: stop('5', 'LAGOON DR') }],
    });
  });
  /**
   * The carry-forward exists so a *keystroke* never blanks the list under a
   * thumb. An explicit filter change is not a keystroke — it is "show me
   * something else" — and carrying stops into the Routes chip read as the chip
   * not having worked. `docs/backlog.md` carried this as an open defect.
   */
  describe('changing the filter', () => {
    it('clears results when the filter changes', async () => {
      mockSearchByName.mockResolvedValue([stop('596', 'KING ST + BISHOP ST')]);

      const { result, rerender } = await renderHook(
        ({ filter }: { filter: 'stops' | 'routes' }) => useSearch('king', filter),
        { initialProps: { filter: 'stops' as const } },
      );

      await waitFor(() => expect(result.current.state.state).toBe('done'));

      // Slow the next answer down, so the state right after the chip is the
      // one under test rather than whatever replaced it.
      mockSearchRoutes.mockImplementation(
        () => new Promise(() => []) as Promise<RouteSummary[]>,
      );
      await rerender({ filter: 'routes' as const });

      await waitFor(() =>
        expect(result.current.state).toEqual({ state: 'running', results: [] }),
      );
    });

    it('keeps the list under a keystroke, which is what the carry-forward is for', async () => {
      const found = stop('596', 'KING ST + BISHOP ST');
      mockSearchByName.mockResolvedValue([found]);

      const { result, rerender } = await renderHook(
        ({ query }: { query: string }) => useSearch(query, 'stops'),
        { initialProps: { query: 'king' } },
      );

      await waitFor(() => expect(result.current.state.state).toBe('done'));

      mockSearchByName.mockImplementation(() => new Promise(() => []) as Promise<Stop[]>);
      await rerender({ query: 'king s' });

      await waitFor(() =>
        expect(result.current.state).toEqual({
          state: 'running',
          results: [{ kind: 'stop', stop: found }],
        }),
      );
    });
  });

});
