import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { repeat } from '../../lib/schedule';
import { theBus, type ArrivalBoard, type ArrivalsFailure, type TheBusClient } from '../../data/thebus';

/**
 * Live arrivals for one stop, polled.
 *
 * §4 of the design makes three states distinct, and keeping them distinct is
 * this hook's whole job:
 *
 *  - **loading** — nothing has arrived yet, so there is nothing to show;
 *  - **data with an age** — a board, plus when it was fetched;
 *  - **error with last-known values** — a failure *alongside* the previous
 *    board, never instead of it.
 *
 * The third is the one that is easy to get wrong. A rider standing at a stop
 * at night must not lose the times they were just reading because one request
 * timed out, so a failed poll sets `failure` and leaves `board` alone, and
 * `loading` never returns to `true` once there is something to show. That is
 * what makes "a spinner never replaces cached data" a property of this hook
 * rather than a rule each screen has to remember.
 */

/** Buses report position about once a minute; the vendor polls its own AVL on
 *  a similar cycle. A shorter interval doubles request volume against a quota
 *  shared by every install and returns identical payloads. */
const POLL_MS = 60_000;

export type ArrivalsView = {
  /** The most recent board, retained across failures. `null` until the first success. */
  readonly board: ArrivalBoard | null;
  /** The current failure, if the most recent attempt failed. */
  readonly failure: ArrivalsFailure | null;
  /** Device clock at the moment `board` arrived — what the displayed age is measured from. */
  readonly fetchedAt: Date | null;
  /** True only before anything has been shown. Never true over a cached board. */
  readonly loading: boolean;
  readonly refresh: () => void;
};

export function useArrivals(stopCode: string, client: TheBusClient = theBus): ArrivalsView {
  const [board, setBoard] = useState<ArrivalBoard | null>(null);
  const [failure, setFailure] = useState<ArrivalsFailure | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Resetting during render rather than in an effect, so that navigating to
   * another stop never paints the previous stop's arrivals under the new
   * stop's name — not even for one frame.
   */
  const [renderedStop, setRenderedStop] = useState(stopCode);
  if (renderedStop !== stopCode) {
    setRenderedStop(stopCode);
    setBoard(null);
    setFailure(null);
    setFetchedAt(null);
    setLoading(true);
  }

  const load = useCallback(
    async (signal: AbortSignal) => {
      const result = await client.arrivals(stopCode, { signal });
      // The stop changed, the screen went away, or the app was backgrounded
      // while this was in flight. Whatever came back is about a question
      // nobody is asking any more.
      if (signal.aborted) return;

      if (result.ok) {
        setBoard(result.board);
        setFetchedAt(new Date());
        setFailure(null);
      } else {
        // Note what is *not* here: `setBoard(null)`. The last known times stay
        // on screen with their age, which is the entire point of §4.
        setFailure(result.failure);
      }
      setLoading(false);
    },
    [client, stopCode],
  );

  /** Set by the effect below so `refresh` can reach the current fetch. */
  const fetchNow = useRef<() => void>(() => {});

  useEffect(() => {
    let inFlight = new AbortController();
    let stopPolling: (() => void) | null = null;

    const tick = () => {
      // At most one request per stop is outstanding. Without this a slow
      // response and a fresh poll can settle out of order and show older
      // times than the ones already on screen.
      inFlight.abort();
      inFlight = new AbortController();
      void load(inFlight.signal);
    };

    const startPolling = () => {
      if (stopPolling === null) stopPolling = repeat(tick, POLL_MS);
    };

    const pausePolling = () => {
      stopPolling?.();
      stopPolling = null;
    };

    fetchNow.current = tick;
    tick();
    startPolling();

    /**
     * Backgrounding stops the timer outright rather than letting it run
     * against a screen nobody is looking at. Coming back fetches immediately:
     * whatever is on screen is at least as old as the time spent away, and
     * someone reopening the app is deciding whether to run for a bus.
     */
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') {
        tick();
        startPolling();
      } else {
        pausePolling();
        inFlight.abort();
      }
    });

    return () => {
      pausePolling();
      inFlight.abort();
      subscription.remove();
    };
  }, [load]);

  const refresh = useCallback(() => fetchNow.current(), []);

  return { board, failure, fetchedAt, loading, refresh };
}
