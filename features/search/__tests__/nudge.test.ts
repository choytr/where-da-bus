import { nudgeFor, type NudgeInput } from '../nudge';
import type { SearchFilter, SearchState } from '../useSearch';

/**
 * The wording, tested as arithmetic. What it has to get right is that a rider
 * who picked the wrong filter is told so in one line and is one tap from the
 * right one — and, just as much, that nobody is nudged towards a filter that
 * has nothing to show either.
 */
const MAP: readonly SearchFilter[] = ['address', 'stops', 'routes'];
const STOPS_TAB: readonly SearchFilter[] = ['stops', 'routes'];

const done = (count: number): SearchState => ({
  state: 'done',
  results: Array.from({ length: count }, () => ({
    kind: 'stop',
    stop: { stop_id: '1', stop_code: '1', stop_name: 'A', lat: 0, lon: 0 },
  })),
});

const ask = (over: Partial<NudgeInput> = {}) =>
  nudgeFor({
    query: 'ala moana',
    filter: 'address',
    filters: MAP,
    state: { state: 'off' },
    matches: { stops: 0, routes: 0 },
    ...over,
  });

describe('nudgeFor', () => {
  it('offers the local data while the address filter is selected', () => {
    // The device probe's own example. Address mode shows nothing until a
    // submit, so this is what fills the screen in the meantime.
    expect(ask({ matches: { stops: 5, routes: 1 } })).toEqual({
      text: '5 stops and 1 route match — switch to Stops',
      to: 'stops',
    });
  });

  it('offers an address search when nothing in the bundled data matched', () => {
    expect(
      ask({ query: '2500 campus rd', filter: 'stops', state: done(0) }),
    ).toEqual({ text: 'No stops match — search as an address', to: 'address' });
  });

  it('sends the rider to the filter with more to show', () => {
    expect(ask({ filter: 'stops', state: done(0), matches: { stops: 0, routes: 2 } })).toEqual({
      text: '2 routes match — switch to Routes',
      to: 'routes',
    });
  });

  it('agrees its verb with a single match', () => {
    expect(ask({ filter: 'stops', state: done(0), matches: { stops: 0, routes: 1 } })?.text).toBe(
      '1 route matches — switch to Routes',
    );
    expect(ask({ filter: 'routes', state: done(0), matches: { stops: 1, routes: 0 } })?.text).toBe(
      '1 stop matches — switch to Stops',
    );
  });

  it('never counts the filter already selected', () => {
    // Stops mode with stop matches is not a case for a nudge; it is a case for
    // showing the stops. Only an *unselected* filter's count can be offered.
    expect(ask({ filter: 'stops', state: done(0), matches: { stops: 9, routes: 0 } })).toEqual({
      text: 'No stops match — search as an address',
      to: 'address',
    });
  });

  it('never offers a filter this host does not have', () => {
    // The Stops tab cannot geocode, so "search as an address" would name a chip
    // that is not on screen.
    expect(
      nudgeFor({
        query: '2500 campus rd',
        filter: 'stops',
        filters: STOPS_TAB,
        state: done(0),
        matches: { stops: 0, routes: 0 },
      }),
    ).toBeNull();
  });

  it('says nothing about an empty field', () => {
    expect(ask({ query: '   ', matches: { stops: 5, routes: 1 } })).toBeNull();
  });

  it('says nothing while the selected filter has results', () => {
    expect(ask({ filter: 'stops', state: done(3), matches: { stops: 3, routes: 4 } })).toBeNull();
  });

  it('says nothing while a search is still running', () => {
    // A line appearing and vanishing between keystrokes is noise, not help.
    expect(
      ask({ filter: 'stops', state: { state: 'running', results: [] }, matches: { stops: 0, routes: 4 } }),
    ).toBeNull();
  });

  it('says nothing after a failure', () => {
    // The counts are zeroed with the failure, so there is nothing to stand
    // behind — and a filter that also just failed sends the rider in a circle.
    expect(ask({ filter: 'stops', state: { state: 'failed' } })).toBeNull();
  });
});
