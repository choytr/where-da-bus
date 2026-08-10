import { useEffect, useRef, useState } from 'react';
import { useStopQueries } from '../../data/gtfs/db';
import { schedule } from '../../lib/schedule';
import type { RouteSummary, Stop } from '../../data/gtfs/types';

/**
 * One query engine, two hosts.
 *
 * The Stops tab and the map's fullscreen search differ in which filters they
 * offer and in what a result *does* — a stop opens the arrival board in one and
 * anchors the map in the other — but not in how they search. Both call this.
 *
 * **There is no classifier**, and that is a finding rather than an omission.
 * All 3,830 stop codes in the feed are numeric and **73 route numbers are also
 * valid stop codes** — 5, 6, 7, 8, 14, 40, 41, 44, 53, 88, 91, 401… Typing
 * `40` means Route 40 (Honolulu–Makaha) *and* stop 40, and both are real. No
 * rule resolves that from two characters. An address heuristic would be worse
 * than none: the obvious one — a street suffix, or a number followed by a word
 * — refuses `ala moana`, `beach` and `university`, which are precisely the
 * three the 2026-08-08 device probe proved *work*. So the filter is the
 * rider's to pick, and the nudge below is what makes picking wrong survivable.
 */

/** Which of the three the rider has selected. Not inferred; see above. */
export type SearchFilter = 'address' | 'stops' | 'routes';

export type SearchResult =
  | { kind: 'stop'; stop: Stop }
  | { kind: 'route'; route: RouteSummary };

/**
 * `running` carries whatever was already on screen, so a keystroke never blanks
 * the list out from under a thumb already reaching for a row — the same rule
 * the arrival board follows. `failed` carries nothing, deliberately: results
 * that could not be fetched are not results, and "nothing matched" must never
 * render like "the lookup fell over".
 */
export type SearchState =
  | { state: 'off' }
  | { state: 'running'; results: SearchResult[] }
  | { state: 'done'; results: SearchResult[] }
  | { state: 'failed' };

/**
 * How many stops and routes the typed text matches locally, whatever filter is
 * selected.
 *
 * This is what makes a wrong filter one tap from right rather than a dead end:
 * *"5 stops and 1 route match — switch to Stops"* while Address is selected,
 * *"No stops match — search as an address"* while Stops is. The local queries
 * are a scan of a bundled SQLite file, so running them unasked costs nothing
 * worth measuring — and in Address mode they fill a screen that would otherwise
 * sit empty waiting for a submit.
 */
export type OtherMatches = { stops: number; routes: number };

/**
 * How long typing has to pause before the database is asked anything. A query
 * per keystroke is a query storm on the native bridge — none of which can be
 * called back once queued — for results nobody reads, since the rider is still
 * typing. Short enough to feel immediate at the end of a word.
 */
const SEARCH_DEBOUNCE_MS = 175;

const NONE: OtherMatches = { stops: 0, routes: 0 };
const NO_RESULTS: SearchResult[] = [];

const OFF: SearchState = { state: 'off' };
const FAILED: SearchState = { state: 'failed' };

const keptResults = (search: SearchState): SearchResult[] =>
  search.state === 'running' || search.state === 'done' ? search.results : NO_RESULTS;

export function useSearch(
  query: string,
  filter: SearchFilter,
): { state: SearchState; otherMatches: OtherMatches } {
  const { searchByCode, searchByName, searchRoutes } = useStopQueries();

  const [state, setState] = useState<SearchState>(OFF);
  const [otherMatches, setOtherMatches] = useState<OtherMatches>(NONE);

  /**
   * The results last committed, read by the effect below so a new query can
   * carry them into `running`. A ref rather than a dependency: the effect must
   * not re-run — and re-debounce — every time its own output changes.
   */
  const onScreen = useRef<SearchResult[]>(NO_RESULTS);
  useEffect(() => {
    onScreen.current = keptResults(state);
  }, [state]);

  /** Which filter produced what is on screen, so a chip change can blank it. */
  const lastFilter = useRef<SearchFilter>(filter);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === '') {
      setState(OFF);
      setOtherMatches(NONE);
      return;
    }

    let cancelled = false;

    /**
     * **A filter change blanks the list; a keystroke does not.**
     *
     * The carry-forward exists for one reason: a rider typing must not have the
     * list vanish under their thumb between keystrokes. Switching filter is not
     * that — it is an explicit *"show me something else"*, and carrying the old
     * filter's results into it left stops on screen under the Routes chip until
     * the query returned, which read as the chip not having worked.
     *
     * Told apart by remembering which filter produced what is on screen, rather
     * than by an effect keyed on `filter` alone: the effect below already runs
     * for both, and a second one racing it would be two writers of one state.
     */
    const carried = lastFilter.current === filter ? onScreen.current : NO_RESULTS;
    lastFilter.current = filter;

    // Address mode shows no local results at all — it is waiting for a submit —
    // but it still runs the queries below for the nudge, so it never claims to
    // be running something it will not display.
    if (filter === 'address') setState(OFF);
    else setState({ state: 'running', results: carried });

    /**
     * Both halves, always, regardless of filter. Two of the three answers are
     * thrown away as results and kept as counts; see `OtherMatches`.
     *
     * The code lookup runs *as well as* the name search rather than instead of
     * it. Numeric input is not evidence of a code — `40` is a route, a stop and
     * a fragment of a stop name — so an exact code hit is put first and
     * everything the name search also found follows it.
     */
    const run = async () => {
      const [byCode, byName, routes] = await Promise.all([
        searchByCode(trimmed),
        searchByName(trimmed),
        searchRoutes(trimmed),
      ]);
      if (cancelled) return;

      const stops =
        byCode === null
          ? byName
          : [byCode, ...byName.filter((stop) => stop.stop_id !== byCode.stop_id)];

      // Counted, not estimated — but both queries carry `SEARCH_LIMIT`, so a
      // query matching half the feed reports the limit rather than the truth.
      // The nudge says "5 stops match", never "all of them".
      setOtherMatches({ stops: stops.length, routes: routes.length });
      if (filter === 'address') return;
      setState({
        state: 'done',
        results:
          filter === 'stops'
            ? stops.map((stop) => ({ kind: 'stop', stop }))
            : routes.map((route) => ({ kind: 'route', route })),
      });
    };

    const cancel = schedule(() => {
      run().catch(() => {
        if (cancelled) return;
        // Counts nobody can stand behind are worse than no counts: a nudge
        // offering a filter that also just failed sends the rider in a circle.
        setOtherMatches(NONE);
        if (filter !== 'address') setState(FAILED);
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      cancel();
    };
  }, [query, filter, searchByCode, searchByName, searchRoutes]);

  return { state, otherMatches };
}
