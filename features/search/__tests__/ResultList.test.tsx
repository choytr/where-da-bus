import { fireEvent, render, screen } from '@testing-library/react-native';
import { ResultList, type ResultListProps } from '../ResultList';
import { TestTheme } from '../../../lib/testing/theme';
import type { RouteSummary, Stop } from '../../../data/gtfs/types';

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

const show = (over: Partial<ResultListProps> = {}) =>
  render(
    <TestTheme>
      <ResultList
        query="lagoon"
        filter="stops"
        filters={['address', 'stops', 'routes']}
        state={{ state: 'done', results: [] }}
        otherMatches={{ stops: 0, routes: 0 }}
        onSelectStop={jest.fn()}
        onSelectRoute={jest.fn()}
        onSwitchFilter={jest.fn()}
        {...over}
      />
    </TestTheme>,
  );

describe('ResultList', () => {
  it('shows a nudge when the selected filter found nothing and another would have', async () => {
    await show({ otherMatches: { stops: 0, routes: 2 } });

    screen.getByText('2 routes match — switch to Routes');
  });

  it('switching filter from the nudge reports the new filter', async () => {
    const onSwitchFilter = jest.fn();
    await show({ otherMatches: { stops: 0, routes: 2 }, onSwitchFilter });

    await fireEvent.press(screen.getByLabelText('2 routes match — switch to Routes'));

    expect(onSwitchFilter).toHaveBeenCalledWith('routes');
  });

  it('a route row shows the number a rider sees on the bus', async () => {
    // `route_id: '26'` is route **40**. Showing the id would hand a rider the
    // wrong bus, so it appears nowhere on the row — only in what a tap opens.
    await show({
      filter: 'routes',
      state: { state: 'done', results: [{ kind: 'route', route: route('26', '40', 'Honolulu-Makaha') }] },
    });

    screen.getByText('40');
    screen.getByText('Honolulu-Makaha');
    expect(screen.queryByText('26')).toBeNull();
  });

  it('opens the route that was tapped, by its id', async () => {
    const onSelectRoute = jest.fn();
    const makaha = route('26', '40', 'Honolulu-Makaha');
    await show({
      filter: 'routes',
      state: { state: 'done', results: [{ kind: 'route', route: makaha }] },
      onSelectRoute,
    });

    await fireEvent.press(screen.getByLabelText('Route 40'));

    expect(onSelectRoute).toHaveBeenCalledWith(makaha);
  });

  it('reports a stop by the number on its pole', async () => {
    const onSelectStop = jest.fn();
    const lagoon = stop('596', 'LAGOON DR');
    await show({
      state: { state: 'done', results: [{ kind: 'stop', stop: lagoon }] },
      onSelectStop,
    });

    await fireEvent.press(screen.getByLabelText('LAGOON DR, stop 596'));

    expect(onSelectStop).toHaveBeenCalledWith(lagoon);
  });

  it('says nothing matched without saying the search failed', async () => {
    // §4's rule at the search field: two different facts, two different lines.
    // On the Stops tab, which has no address to fall back to and so no nudge.
    await show({ filters: ['stops', 'routes'], state: { state: 'done', results: [] } });

    screen.getByText('No stops match that.');
    expect(screen.queryByText(/Could not search/)).toBeNull();
  });

  it('lets the nudge stand in for the empty notice rather than saying it twice', async () => {
    await show({ state: { state: 'done', results: [] } });

    screen.getByText('No stops match — search as an address');
    expect(screen.queryByText('No stops match that.')).toBeNull();
  });

  it('says the search failed without saying nothing matched', async () => {
    await show({ state: { state: 'failed' } });

    screen.getByText('Could not search the stop list on this device.');
    expect(screen.queryByText('No stops match that.')).toBeNull();
  });

  it('keeps the results on screen while the next search runs', async () => {
    // A spinner must never replace results a thumb is already reaching for.
    await show({
      state: { state: 'running', results: [{ kind: 'stop', stop: stop('5', 'LAGOON DR') }] },
    });

    screen.getByText('Searching…');
    screen.getByText('LAGOON DR');
  });

  it('says what the address filter is waiting for', async () => {
    // Address shows nothing until a submit, and a blank screen would read as a
    // search that returned nothing.
    await show({ query: '', filter: 'address' });

    screen.getByText('Type an address, then search.');
  });
});
