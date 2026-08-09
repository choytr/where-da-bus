import type { OtherMatches, SearchFilter, SearchState } from './useSearch';

/**
 * What each filter is called — on its chip, and in the sentence offering to
 * switch to it. One map so the two can never disagree, which matters because
 * the nudge's whole job is to name a chip the rider can then go and find.
 */
export const FILTER_LABELS: Record<SearchFilter, string> = {
  address: 'Address',
  stops: 'Stops',
  routes: 'Routes',
};

/** A line offering the filter that would have answered, and the filter itself. */
export type Nudge = { text: string; to: SearchFilter };

export type NudgeInput = {
  /** As typed. An empty field is not a failed search, and gets no nudge. */
  query: string;
  filter: SearchFilter;
  /** Which filters this host offers. The Stops tab has no Address. */
  filters: readonly SearchFilter[];
  state: SearchState;
  matches: OtherMatches;
};

/**
 * What to say when the selected filter has nothing to show, and another one
 * would have.
 *
 * A filter is only survivable if picking the wrong one is not a dead end, and
 * this is the recovery: one line, one tap. The local counts behind it run
 * whatever the filter is set to — see `OtherMatches` — which is what lets this
 * be offered *before* a submit rather than after a rider gives up.
 *
 * Pure, so the wording is tested as arithmetic rather than through a rendered
 * list. Returns null wherever there is nothing honest to offer: an empty field,
 * a search still running, a search that fell over (its counts are zeroed with
 * it, and offering a filter that also just failed sends the rider in a circle),
 * or a selected filter that found something.
 */
export function nudgeFor({ query, filter, filters, state, matches }: NudgeInput): Nudge | null {
  if (query.trim() === '') return null;

  // Address never shows local results — it is waiting for a submit — so `off`
  // is its resting state and the one where a nudge is most useful. Everywhere
  // else `off` means an empty field, which the guard above has taken.
  const empty =
    state.state === 'off' || (state.state === 'done' && state.results.length === 0);
  if (!empty) return null;

  const offered = (candidate: SearchFilter) =>
    candidate !== filter && filters.some((f) => f === candidate);

  const stops = offered('stops') ? matches.stops : 0;
  const routes = offered('routes') ? matches.routes : 0;

  if (stops > 0 || routes > 0) {
    // Both matched: send them to the one with more to show, and to Stops on a
    // tie, which is the commoner thing to be looking for with a map open.
    const to: SearchFilter = stops >= routes ? 'stops' : 'routes';
    return { text: `${countPhrase(stops, routes)} — switch to ${FILTER_LABELS[to]}`, to };
  }

  // Nothing in the bundled data matched at all. If this host can geocode, that
  // is the thing left to try — and `2500 campus rd` is exactly the query that
  // lands here.
  if (offered('address')) {
    return { text: `No ${noun(filter)} match — search as an address`, to: 'address' };
  }

  return null;
}

const noun = (filter: SearchFilter): string => (filter === 'routes' ? 'routes' : 'stops');

const count = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

/** "5 stops and 1 route match", but "1 route matches" when it stands alone. */
function countPhrase(stops: number, routes: number): string {
  const parts: string[] = [];
  if (stops > 0) parts.push(count(stops, 'stop', 'stops'));
  if (routes > 0) parts.push(count(routes, 'route', 'routes'));
  const singular = parts.length === 1 && stops + routes === 1;
  return `${parts.join(' and ')} ${singular ? 'matches' : 'match'}`;
}
