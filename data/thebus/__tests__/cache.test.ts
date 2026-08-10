import { withCache } from '../cache';
import type { TheBusClient } from '../client';
import type { ArrivalsResult } from '../types';

function board(stopCode: string): ArrivalsResult {
  return {
    ok: true,
    board: { stopCode, serverTime: new Date('2026-08-02T22:00:00Z'), arrivals: [] },
  };
}

const unreachable: ArrivalsResult = { ok: false, failure: { kind: 'unreachable' } };

/**
 * An inner client whose every call is settled by hand, so a test can hold two
 * callers inside one in-flight request and observe what the wrapper did.
 */
function controllable() {
  const calls: {
    stopCode: string;
    signal: AbortSignal | undefined;
    settle: (result: ArrivalsResult) => void;
  }[] = [];

  const client: TheBusClient = {
    arrivals: (stopCode, options) =>
      new Promise<ArrivalsResult>((resolve) => {
        calls.push({ stopCode, signal: options?.signal, settle: resolve });
      }),
    // This stub is about coalescing arrival requests and nothing else. Throwing
    // says so, where a no-op stub would let a future test quietly assert
    // nothing about a call it thought it was making.
    vehicles: () => {
      throw new Error('controllable() does not serve the fleet endpoint');
    },
  };

  /**
   * The nth call, or a thrown error naming what was missing.
   *
   * **Not `calls[n]?.settle(…)`.** These tests are largely *about* how many
   * requests reached the inner client, so a call that never happened has to
   * fail the test rather than resolve to `undefined` and skip silently — which
   * is exactly the weakening that optional chaining would introduce here.
   */
  const call = (index: number) => {
    const found = calls[index];
    if (found === undefined) {
      throw new Error(`expected at least ${index + 1} call(s), saw ${calls.length}`);
    }
    return found;
  };

  return { client, calls, call };
}

describe('withCache', () => {
  it('makes one request for two callers asking at the same time', async () => {
    const { client, calls, call } = controllable();
    const cached = withCache(client);

    const first = cached.arrivals('596');
    const second = cached.arrivals('596');
    expect(calls).toHaveLength(1);

    call(0).settle(board('596'));
    expect(await first).toEqual(await second);
  });

  it('does not coalesce different stops', async () => {
    const { client, calls } = controllable();
    const cached = withCache(client);

    void cached.arrivals('596');
    void cached.arrivals('4544');

    expect(calls.map((c) => c.stopCode)).toEqual(['596', '4544']);
  });

  it('serves a second caller from cache within the TTL', async () => {
    const { client, calls, call } = controllable();
    let clock = 1_000;
    const cached = withCache(client, { ttlMs: 30_000, now: () => clock });

    const first = cached.arrivals('596');
    call(0).settle(board('596'));
    await first;

    clock += 29_000;
    await cached.arrivals('596');

    expect(calls).toHaveLength(1);
  });

  it('requests again once the TTL has passed', async () => {
    const { client, calls, call } = controllable();
    let clock = 1_000;
    const cached = withCache(client, { ttlMs: 30_000, now: () => clock });

    const first = cached.arrivals('596');
    call(0).settle(board('596'));
    await first;

    clock += 30_000;
    void cached.arrivals('596');

    expect(calls).toHaveLength(2);
  });

  it('never caches a failure', async () => {
    const { client, calls, call } = controllable();
    const cached = withCache(client, { ttlMs: 30_000, now: () => 1_000 });

    const first = cached.arrivals('596');
    call(0).settle(unreachable);
    expect(await first).toEqual(unreachable);

    // Same instant, so a cached *success* would have been served here.
    void cached.arrivals('596');
    expect(calls).toHaveLength(2);
  });

  it('bypasses the cache when the caller asks for fresh data', async () => {
    const { client, calls, call } = controllable();
    const cached = withCache(client, { ttlMs: 30_000, now: () => 1_000 });

    const first = cached.arrivals('596');
    call(0).settle(board('596'));
    await first;

    void cached.arrivals('596', { fresh: true });
    expect(calls).toHaveLength(2);
  });

  it('drops the cached copy for everyone when one caller asks for fresh data', async () => {
    const { client, calls, call } = controllable();
    const cached = withCache(client, { ttlMs: 30_000, now: () => 1_000 });

    const first = cached.arrivals('596');
    call(0).settle(board('596'));
    await first;

    const refreshed = cached.arrivals('596', { fresh: true });
    call(1).settle(board('596'));
    await refreshed;

    // A third caller must not be handed the copy the pull-to-refresh declared
    // stale — it was stale for every screen, not just the one that pulled.
    void cached.arrivals('596');
    expect(calls).toHaveLength(2);
  });

  it('keeps the request alive when one of two callers aborts', async () => {
    const { client, call } = controllable();
    const cached = withCache(client);
    const leaving = new AbortController();

    const staying = cached.arrivals('596');
    const going = cached.arrivals('596', { signal: leaving.signal });

    leaving.abort();
    expect(call(0).signal?.aborted).toBe(false);

    call(0).settle(board('596'));
    expect(await staying).toEqual(board('596'));
    await going;
  });

  it('cancels the request once every caller has aborted', async () => {
    const { client, call } = controllable();
    const cached = withCache(client);
    const first = new AbortController();
    const second = new AbortController();

    void cached.arrivals('596', { signal: first.signal });
    void cached.arrivals('596', { signal: second.signal });

    first.abort();
    expect(call(0).signal?.aborted).toBe(false);

    second.abort();
    expect(call(0).signal?.aborted).toBe(true);
  });

  it('does not hand a new caller the failure of a request everyone else abandoned', async () => {
    // Found at Increment 3's boundary review. The abort guard above protects
    // callers already waiting, but a caller arriving in the window between the
    // abort and the promise settling used to join the dead request and receive
    // its `unreachable` as though it were an answer. On the map that window is
    // one tap wide: select a pin, select another, select the first again.
    const { client, calls, call } = controllable();
    const cached = withCache(client);

    const leaving = new AbortController();
    const abandoned = cached.arrivals('596', { signal: leaving.signal });
    leaving.abort();
    expect(call(0).signal?.aborted).toBe(true);

    const arriving = cached.arrivals('596');
    expect(calls).toHaveLength(2);

    call(0).settle(unreachable);
    call(1).settle(board('596'));

    expect(await arriving).toEqual(board('596'));
    await abandoned;
  });

  it('starts a new request after the previous one has settled', async () => {
    const { client, calls, call } = controllable();
    const cached = withCache(client, { ttlMs: 0, now: () => 1_000 });

    const first = cached.arrivals('596');
    call(0).settle(board('596'));
    await first;

    void cached.arrivals('596');
    expect(calls).toHaveLength(2);
  });
});
