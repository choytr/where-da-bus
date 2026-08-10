import { fireEvent, render, screen } from '@testing-library/react-native';
import { showRowMenu, type RowAction } from '../../../lib/rowMenu';
import { showOnMap } from '../showOnMap';
import { StopRow } from '../../stops/StopRow';
import { RouteRow } from '../../search/RouteRow';
import { ArrivalRow } from '../../arrivals/ArrivalRow';
import { RouteList } from '../RouteList';
import { TestTheme } from '../../../lib/testing/theme';
import type { Arrival } from '../../../data/thebus';
import type { StopWithDistance } from '../../../data/gtfs/types';

/**
 * *Long-press anything, get it on the map* — the spine of Increment 9, and four
 * rows' worth of one idea.
 *
 * The menu itself is stubbed so the actions can be read as data: what matters
 * per row is **which entries are offered** and **what each one asks the map
 * for**, and neither of those is observable through a real `ActionSheetIOS`
 * under Jest. `lib/__tests__/rowMenu.test.ts` owns the sheet.
 */
jest.mock('../../../lib/rowMenu', () => ({ showRowMenu: jest.fn(async () => {}) }));
jest.mock('../showOnMap', () => ({ showOnMap: jest.fn() }));

/** `RouteList` scrolls inside the sheet, and its list throws outside one. */
jest.mock('@gorhom/bottom-sheet', () => require('@gorhom/bottom-sheet/mock'));

const menu = jest.mocked(showRowMenu);
const asked = jest.mocked(showOnMap);

/** The actions the last long press offered. */
function offered(): readonly RowAction[] {
  return menu.mock.calls.at(-1)?.[0] ?? [];
}

/** Picks the offered entry whose label matches, as a rider tapping it would. */
function choose(label: string) {
  const action = offered().find((entry) => entry.label === label);
  if (action === undefined) {
    throw new Error(`no "${label}" in [${offered().map((a) => a.label).join(', ')}]`);
  }
  action.run();
}

const stop: StopWithDistance = {
  stop_id: '5',
  stop_code: '901',
  stop_name: 'LAGOON DR + IOLANA PL',
  lat: 21.32,
  lon: -157.9,
  meters: 120,
};

const route = { route_id: '31', short_name: '32', long_name: 'Mapunapuna-Airport' };

function arrival(overrides: Partial<Arrival> = {}): Arrival {
  return {
    id: 'a-1',
    tripId: 'trip-1',
    route: '32',
    headsign: 'AIRPORT',
    direction: 'Westbound',
    arrivesAt: new Date('2026-08-10T20:10:00Z'),
    estimate: 'live',
    vehicle: '252',
    shape: 's-out',
    position: { lat: 21.32, lon: -157.9 },
    canceled: false,
    ...overrides,
  };
}

beforeEach(() => {
  menu.mockClear();
  asked.mockClear();
});

describe('StopRow’s long press', () => {
  const renderRow = (canShowOnMap = true) =>
    render(
      <TestTheme>
        <StopRow
          stop={stop}
          routes={[]}
          meters={120}
          isFavorite={false}
          onToggleFavorite={() => {}}
          canShowOnMap={canShowOnMap}
        />
      </TestTheme>,
    );

  it('offers the map and the favorite', async () => {
    await renderRow();

    await fireEvent(screen.getByText('LAGOON DR + IOLANA PL'), 'longPress');

    expect(offered().map((a) => a.label)).toEqual(['Show stop on map', 'Add to favorites']);
  });

  it('asks the map for this stop', async () => {
    await renderRow();
    await fireEvent(screen.getByText('LAGOON DR + IOLANA PL'), 'longPress');

    choose('Show stop on map');

    expect(asked).toHaveBeenCalledWith({ kind: 'stop', stopId: '5' });
  });

  /** On the map's own list the answer is already on screen. */
  it('omits show-on-map where the rider is already looking at one', async () => {
    await renderRow(false);

    await fireEvent(screen.getByText('LAGOON DR + IOLANA PL'), 'longPress');

    expect(offered().map((a) => a.label)).toEqual(['Add to favorites']);
  });

  it('names the favorite entry for what it will do', async () => {
    await render(
      <TestTheme>
        <StopRow
          stop={stop}
          routes={[]}
          meters={null}
          isFavorite
          onToggleFavorite={() => {}}
        />
      </TestTheme>,
    );

    await fireEvent(screen.getByText('LAGOON DR + IOLANA PL'), 'longPress');

    expect(offered().map((a) => a.label)).toContain('Remove from favorites');
  });
});

describe('RouteRow’s long press', () => {
  it('draws the route on the map', async () => {
    await render(
      <TestTheme>
        <RouteRow route={route} onPress={() => {}} />
      </TestTheme>,
    );

    await fireEvent(screen.getByLabelText('Route 32'), 'longPress');
    choose('Show route on map');

    // `route_id`, not the number on the bus: `route_id: '40'` is route C.
    expect(asked).toHaveBeenCalledWith({ kind: 'route', routeId: '31' });
  });
});

describe('ArrivalRow’s long press', () => {
  const renderRow = (over: Partial<Arrival> = {}, stopId: string | null = '5') =>
    render(
      <TestTheme>
        <ArrivalRow arrival={arrival(over)} now={new Date('2026-08-10T20:00:00Z')} stopId={stopId} />
      </TestTheme>,
    );

  const longPress = async () =>
    fireEvent(screen.getByLabelText(/Route 32 to AIRPORT/), 'longPress');

  it('offers the live bus and the route when a bus is reporting', async () => {
    await renderRow();

    await longPress();

    expect(offered().map((a) => a.label)).toEqual([
      'Show live bus on map',
      'Show route on map',
    ]);
  });

  /**
   * **Absent, not disabled.** Most arrivals are schedule-only — 6.3% carried a
   * bus at 00:40 HST on 2026-08-10, nearer one in ten by day — and a
   * permanently greyed row reads as broken rather than as informative.
   */
  it('offers no live bus for a scheduled arrival', async () => {
    await renderRow({ estimate: 'scheduled', vehicle: null });

    await longPress();

    expect(offered().map((a) => a.label)).toEqual(['Show route on map']);
  });

  it('offers no live bus for a live arrival with no vehicle assigned', async () => {
    await renderRow({ vehicle: null });

    await longPress();

    expect(offered().map((a) => a.label)).toEqual(['Show route on map']);
  });

  it('carries the trip, so the map can single that bus out', async () => {
    await renderRow();
    await longPress();

    choose('Show live bus on map');

    expect(asked).toHaveBeenCalledWith({
      kind: 'arrival',
      routeName: '32',
      tripId: 'trip-1',
      stopId: '5',
    });
  });

  /** The route alone: every arrival can answer this one. */
  it('asks for the route with no trip when only the route was wanted', async () => {
    await renderRow();
    await longPress();

    choose('Show route on map');

    expect(asked).toHaveBeenCalledWith({
      kind: 'arrival',
      routeName: '32',
      tripId: null,
      stopId: '5',
    });
  });

  /** `/stop/[code]` resolves its stop from a code, and that takes a moment. */
  it('offers only the route while the stop row is still resolving', async () => {
    await renderRow({}, null);

    await longPress();

    expect(offered().map((a) => a.label)).toEqual(['Show route on map']);
  });
});

describe('the route list’s long press', () => {
  it('opens arrivals and toggles the favorite, and does not offer the map', async () => {
    const onSelect = jest.fn();
    const onToggleFavorite = jest.fn();
    await render(
      <TestTheme>
        <RouteList
          stops={[stop]}
          selectedStopId={null}
          onSelect={onSelect}
          favorites={[]}
          onToggleFavorite={onToggleFavorite}
        />
      </TestTheme>,
    );

    await fireEvent(screen.getByLabelText('Stop 1, LAGOON DR + IOLANA PL'), 'longPress');

    // The rider is already on the map; the pin for this stop is on it.
    expect(offered().map((a) => a.label)).toEqual(['Open arrivals', 'Add to favorites']);

    choose('Open arrivals');
    expect(onSelect).toHaveBeenCalledWith(stop);

    choose('Add to favorites');
    expect(onToggleFavorite).toHaveBeenCalledWith('5');
  });
});
