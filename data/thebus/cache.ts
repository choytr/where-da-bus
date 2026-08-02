import type { TheBusClient } from './client';
import type { ArrivalsResult } from './types';

/**
 * Two requests for the same stop should cost one request.
 *
 * Until Increment 3 only one screen ever asked for arrivals, so nothing shared
 * and nothing collided. The map's expanded row asks the same question the
 * arrival board asks, a navigation animation can have both mounted at once,
 * and a remount during that animation asks a third time. The AppID's
 * 250,000/day quota is shared across every install of the app — see
 * docs/superpowers/specs/2026-08-02-thebuslive-comparison.md — so duplicate
 * requests are not merely wasteful, they come out of a fixed pool.
 *
 * This wraps any TheBusClient and adds two things:
 *
 * - **Coalescing.** Callers arriving while a request for the same stop is in
 *   flight await that request instead of starting another.
 * - **A short cache.** A successful result is reused for `ttlMs`.
 *
 * Failures are never cached. A cached failure would turn a recovered API into
 * thirty seconds of false outage, and "couldn't reach the service" is exactly
 * the state a rider retries out of.
 */

/** Shorter than the 60 s poll, so the cache can never suppress a scheduled refresh. */
const TTL_MS = 30_000;

type Entry = {
  promise: Promise<ArrivalsResult>;
  controller: AbortController;
  /** How many callers still want this result. See the abort handling below. */
  waiting: number;
};

export type CacheOptions = {
  ttlMs?: number;
  /** Injectable so tests do not depend on wall-clock time. */
  now?: () => number;
};

export function withCache(inner: TheBusClient, options: CacheOptions = {}): TheBusClient {
  const { ttlMs = TTL_MS, now = Date.now } = options;

  const fresh = new Map<string, { result: ArrivalsResult; at: number }>();
  const inFlight = new Map<string, Entry>();

  function cached(stopCode: string): ArrivalsResult | null {
    const hit = fresh.get(stopCode);
    if (hit === undefined) return null;
    if (now() - hit.at >= ttlMs) {
      fresh.delete(stopCode);
      return null;
    }
    return hit.result;
  }

  function start(stopCode: string): Entry {
    const controller = new AbortController();

    const promise = inner
      .arrivals(stopCode, { signal: controller.signal })
      .then((result) => {
        if (result.ok) fresh.set(stopCode, { result, at: now() });
        return result;
      })
      .finally(() => {
        inFlight.delete(stopCode);
      });

    const entry: Entry = { promise, controller, waiting: 0 };
    inFlight.set(stopCode, entry);
    return entry;
  }

  async function arrivals(
    stopCode: string,
    requestOptions?: { signal?: AbortSignal; fresh?: boolean },
  ): Promise<ArrivalsResult> {
    const wantsFresh = requestOptions?.fresh === true;
    const signal = requestOptions?.signal;

    if (!wantsFresh) {
      const hit = cached(stopCode);
      if (hit !== null) return hit;
    }

    // A caller demanding fresh data drops the cached copy so that everyone
    // else stops being served it too — a pull-to-refresh means "this is stale",
    // and that is true for every screen, not just the one that pulled.
    if (wantsFresh) fresh.delete(stopCode);

    const entry = inFlight.get(stopCode) ?? start(stopCode);
    entry.waiting += 1;

    /**
     * One caller's abort must not cancel a request another caller is still
     * waiting on — that is the failure a naive shared promise introduces, and
     * it looks like a random empty arrival board. The underlying request is
     * cancelled only once *every* caller has walked away, which is also what
     * keeps an unmount from leaving a request running for nobody.
     */
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      entry.waiting -= 1;
      if (entry.waiting === 0) entry.controller.abort();
    };

    signal?.addEventListener('abort', release);

    try {
      return await entry.promise;
    } finally {
      signal?.removeEventListener('abort', release);
      if (!released) {
        released = true;
        entry.waiting -= 1;
      }
    }
  }

  return { arrivals };
}
