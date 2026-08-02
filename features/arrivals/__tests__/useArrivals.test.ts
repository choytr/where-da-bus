import { act, cleanup, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { useArrivals } from '../useArrivals';
import type { ArrivalsResult, TheBusClient } from '../../../data/thebus';

/**
 * The §4 state model lives here: loading, data with an age, and error with
 * last-known values are three different things, and the rule that a spinner
 * never replaces cached data is a property of this hook rather than of the
 * screen that renders it.
 */

const boardResult = (stopCode: string, timestamp = '8/1/2026 10:35:40 PM'): ArrivalsResult => ({
  ok: true,
  board: {
    stopCode,
    serverTime: new Date('2026-08-02T08:35:40.000Z'),
    arrivals: [
      {
        id: '1',
        tripId: 't',
        route: '2',
        headsign: 'WAIKIKI',
        direction: 'Westbound',
        arrivesAt: new Date('2026-08-02T08:45:00.000Z'),
        estimate: 'live',
        vehicle: '871',
        position: { lat: 21.3, lon: -157.85 },
        canceled: false,
      },
    ],
  },
});

const unreachable: ArrivalsResult = { ok: false, failure: { kind: 'unreachable' } };

/**
 * `AppState` is doubled for *every* test in this file, not only the two that
 * drive it, and restored by hand rather than through `jest.restoreAllMocks`.
 *
 * Spying on it in some tests and not others poisons the ones that follow: the
 * restore leaves `AppState.addEventListener` in a state where the hook's
 * effect throws, so the next test's effect never runs and its assertions fail
 * with a call count of zero — which reads as a broken hook rather than a
 * broken harness. Mocking uniformly removes the asymmetry that causes it.
 */
let appStateHandlers: ((s: AppStateStatus) => void)[] = [];
let appStateSpy: jest.SpyInstance;

const goToAppState = (status: AppStateStatus) => {
  for (const handler of [...appStateHandlers]) handler(status);
};

/** A promise a test resolves when it chooses, for observing in-flight states. */
function deferred<T>() {
  let settle: (value: T) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

const clientReturning = (...results: ArrivalsResult[]): TheBusClient & { calls: number } => {
  const client = {
    calls: 0,
    arrivals: async () => {
      const result = results[Math.min(client.calls, results.length - 1)];
      client.calls += 1;
      return result;
    },
  };
  return client;
};

/**
 * `render`, `renderHook`, `rerender` and `unmount` are all **async** in React
 * Native Testing Library 14 — the React 19 renderer flushes through an async
 * `act`. Dropping an `await` does not fail loudly: the tree never mounts, no
 * effect runs, and the symptom is `result.current` being undefined or a
 * "`render` function has not been called" from `screen`, neither of which
 * points at the missing keyword.
 *
 * `jest.advanceTimersByTimeAsync` awaits inside the `act` scope it is called
 * in, which nests act scopes and trips React's "overlapping act() calls"
 * guard. Advancing synchronously inside an async `act` gets the same effect —
 * timers fire, then the callback resolving flushes the microtasks their
 * handlers queued.
 */
const flush = () => act(async () => {});
const advance = (ms: number) => act(async () => { jest.advanceTimersByTime(ms); });

/**
 * Every state transition below goes through an **async** `act`, including the
 * `AppState` ones that look synchronous. Backgrounding and foregrounding both
 * start a fetch from outside React's render cycle, and its `setState` lands a
 * microtask later — after a synchronous `act(() => …)` has already closed.
 * That leaves React's act queue inconsistent, and the damage lands on the
 * *next* test in the file, whose effects then never run at all. It reads as a
 * broken hook; it is a missing `await`.
 */

describe('useArrivals', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    appStateHandlers = [];
    appStateSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((event, handler) => {
        if (event === 'change') appStateHandlers.push(handler);
        return {
          remove: () => {
            appStateHandlers = appStateHandlers.filter((h) => h !== handler);
          },
        };
      });
  });

  afterEach(async () => {
    // Unmount before the timers are swapped back. React Native Testing
    // Library registers its own auto-cleanup as a top-level `afterEach`,
    // which Jest runs *after* this one — so without an explicit call here,
    // every hook mounted above is still mounted and still polling while the
    // fake timers are torn down. The damage shows up in the *next* test,
    // whose effects then never run at all, and it looks like the hook is
    // broken rather than the harness.
    await cleanup();
    appStateSpy.mockRestore();
    jest.useRealTimers();
  });

  it('starts out loading, with nothing to show yet', async () => {
    // The request is held open on purpose. `renderHook` is async and flushes
    // effects before it resolves, so a client that answers immediately would
    // have already delivered a board by the first assertion.
    const first = deferred<ArrivalsResult>();
    const client: TheBusClient = { arrivals: () => first.promise };
    const { result } = await renderHook(() => useArrivals('45', client));

    expect(result.current.loading).toBe(true);
    expect(result.current.board).toBeNull();
    expect(result.current.failure).toBeNull();

    await act(async () => {
      first.settle(boardResult('45'));
    });
    expect(result.current.loading).toBe(false);
  });

  it('lands on a board with the moment it was fetched', async () => {
    const client = clientReturning(boardResult('45'));
    const { result } = await renderHook(() => useArrivals('45', client));

    await flush();
    expect(result.current.board).not.toBeNull();
    expect(result.current.board?.stopCode).toBe('45');
    expect(result.current.fetchedAt).toBeInstanceOf(Date);
    expect(result.current.failure).toBeNull();
  });

  it('reports a failure when there is nothing cached to fall back to', async () => {
    const client = clientReturning(unreachable);
    const { result } = await renderHook(() => useArrivals('45', client));

    await flush();
    expect(result.current.loading).toBe(false);
    expect(result.current.failure).toEqual({ kind: 'unreachable' });
    expect(result.current.board).toBeNull();
  });

  it('keeps the last board when a later poll fails', async () => {
    // The §4 rule that matters most. A rider at a stop at night must not lose
    // the times they were just looking at because one request timed out.
    const client = clientReturning(boardResult('45'), unreachable);
    const { result } = await renderHook(() => useArrivals('45', client));

    await flush();
    expect(result.current.board).not.toBeNull();

    await advance(60_000);

    expect(result.current.board?.stopCode).toBe('45');
    expect(result.current.failure).toEqual({ kind: 'unreachable' });
    // And it is not pretending to load, which would license a spinner over
    // the cached times.
    expect(result.current.loading).toBe(false);
  });

  it('clears a stale failure once a poll succeeds again', async () => {
    const client = clientReturning(unreachable, boardResult('45'));
    const { result } = await renderHook(() => useArrivals('45', client));

    await flush();
    expect(result.current.failure).not.toBeNull();

    await advance(60_000);

    expect(result.current.failure).toBeNull();
    expect(result.current.board).not.toBeNull();
  });

  it('polls once a minute', async () => {
    // 60s, not less: buses report position about once a minute and the vendor
    // polls its own AVL on a similar cycle, so a shorter interval doubles
    // request volume against a shared quota for identical payloads.
    const client = clientReturning(boardResult('45'));
    await renderHook(() => useArrivals('45', client));

    await flush();
    expect(client.calls).toBe(1);

    await advance(59_000);
    expect(client.calls).toBe(1);

    await advance(1_000);
    expect(client.calls).toBe(2);
  });

  it('stops polling while the app is backgrounded', async () => {
    const client = clientReturning(boardResult('45'));
    await renderHook(() => useArrivals('45', client));

    await flush();
    expect(client.calls).toBe(1);

    await act(async () => { goToAppState('background'); });

    await advance(180_000);

    expect(client.calls).toBe(1);
  });

  it('refetches immediately on returning to the foreground', async () => {
    // Whatever is on screen is at least as old as the time spent away, so
    // waiting out the rest of an interval would show stale times to someone
    // who just looked at their phone to decide whether to run.
    const client = clientReturning(boardResult('45'));
    await renderHook(() => useArrivals('45', client));

    await flush();
    expect(client.calls).toBe(1);

    await act(async () => { goToAppState('background'); });
    await advance(120_000);
    expect(client.calls).toBe(1);

    await act(async () => { goToAppState('active'); });

    expect(client.calls).toBe(2);
  });

  it('fetches again on demand when asked to refresh', async () => {
    const client = clientReturning(boardResult('45'));
    const { result } = await renderHook(() => useArrivals('45', client));

    await flush();
    expect(client.calls).toBe(1);

    await act(async () => { result.current.refresh(); });

    expect(client.calls).toBe(2);
  });

  it('tells the client a pull is a pull, so a cache cannot answer it', async () => {
    // The one gesture that means "I do not believe what is on screen". A
    // cached client must not serve it from the copy being disbelieved.
    const asked: (boolean | undefined)[] = [];
    const client: TheBusClient = {
      arrivals: async (_stopCode, options) => {
        asked.push(options?.fresh);
        return boardResult('45');
      },
    };
    const { result } = await renderHook(() => useArrivals('45', client));
    await flush();

    await act(async () => { result.current.refresh(); });

    expect(asked[0]).toBe(false);
    expect(asked[1]).toBe(true);
  });

  it('flags a pull-to-refresh while it runs, but never a background poll', async () => {
    // The distinction the RefreshControl depends on. A spinner that blinked
    // every 60 seconds would be noise, and one that never appeared would make
    // a pull feel broken.
    const pending = deferred<ArrivalsResult>();
    let call = 0;
    const client: TheBusClient = {
      arrivals: async () => (call++ === 0 ? boardResult('45') : pending.promise),
    };
    const { result } = await renderHook(() => useArrivals('45', client));

    await flush();
    expect(result.current.refreshing).toBe(false);

    await act(async () => {
      result.current.refresh();
    });
    expect(result.current.refreshing).toBe(true);

    await act(async () => {
      pending.settle(boardResult('45'));
    });
    expect(result.current.refreshing).toBe(false);
  });

  it('does not flag refreshing for the 60-second poll', async () => {
    const client = clientReturning(boardResult('45'));
    const { result } = await renderHook(() => useArrivals('45', client));

    await flush();
    await advance(60_000);

    expect(result.current.refreshing).toBe(false);
  });

  it('starts over when the stop changes', async () => {
    // The second stop's response is held open so the state between the two
    // can be observed. That gap is the point of the test: it is where the
    // previous stop's arrivals would otherwise still be on screen.
    const second = deferred<ArrivalsResult>();
    let call = 0;
    const client: TheBusClient = {
      arrivals: async () => (call++ === 0 ? boardResult('45') : second.promise),
    };
    const { result, rerender } = await renderHook(({ stop }: { stop: string }) => useArrivals(stop, client), {
      initialProps: { stop: '45' },
    });

    await flush();
    expect(result.current.board?.stopCode).toBe('45');

    await rerender({ stop: '596' });

    // The previous stop's arrivals must not linger behind the new stop's name.
    expect(result.current.board).toBeNull();
    expect(result.current.loading).toBe(true);

    await act(async () => {
      second.settle(boardResult('596'));
    });
    expect(result.current.board?.stopCode).toBe('596');
  });

  it('stops polling once unmounted', async () => {
    const client = clientReturning(boardResult('45'));
    const { unmount } = await renderHook(() => useArrivals('45', client));

    await flush();
    expect(client.calls).toBe(1);
    await unmount();

    await advance(180_000);

    expect(client.calls).toBe(1);
  });
});
