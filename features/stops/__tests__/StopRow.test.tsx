import { render, fireEvent, screen } from '@testing-library/react-native';
import { StopRow } from '../StopRow';

const stop = {
  stop_id: '5',
  stop_code: '5',
  stop_name: 'LAGOON DR + IOLANA PL',
  lat: 21.321687,
  lon: -157.907687,
};

const routes = [
  { route_id: '19', short_name: '19', long_name: 'Airport' },
  { route_id: '20', short_name: '20', long_name: 'Airport-Pearlridge' },
];

// The installed @testing-library/react-native@14.0.1 has `render` and
// `fireEvent.press` both return Promises (see dist/render.d.ts,
// dist/fire-event.d.ts) even though `renderHook` is the only one commonly
// called out as async — every call here is awaited to match that reality.
describe('StopRow', () => {
  it('shows the stop name and code', async () => {
    await render(<StopRow stop={stop} routes={routes} meters={null} isFavorite={false} onToggleFavorite={jest.fn()} />);
    screen.getByText('LAGOON DR + IOLANA PL');
    screen.getByText('Stop 5');
  });

  it('lists every route serving the stop', async () => {
    await render(<StopRow stop={stop} routes={routes} meters={null} isFavorite={false} onToggleFavorite={jest.fn()} />);
    screen.getByText('19');
    screen.getByText('20');
  });

  it('shows metres when close by', async () => {
    await render(<StopRow stop={stop} routes={routes} meters={368} isFavorite={false} onToggleFavorite={jest.fn()} />);
    screen.getByText('368 m');
  });

  it('switches to kilometres past 1000 m', async () => {
    await render(<StopRow stop={stop} routes={routes} meters={2400} isFavorite={false} onToggleFavorite={jest.fn()} />);
    screen.getByText('2.4 km');
  });

  it('omits distance when location is unavailable', async () => {
    await render(<StopRow stop={stop} routes={routes} meters={null} isFavorite={false} onToggleFavorite={jest.fn()} />);
    expect(screen.queryByText(/m$/)).toBeNull();
  });

  it('calls back with the stop id when the favorite control is pressed', async () => {
    const onToggle = jest.fn();
    await render(<StopRow stop={stop} routes={routes} meters={null} isFavorite={false} onToggleFavorite={onToggle} />);
    await fireEvent.press(screen.getByLabelText('Add LAGOON DR + IOLANA PL to favorites'));
    expect(onToggle).toHaveBeenCalledWith('5');
  });

  it('describes the control differently once favorited', async () => {
    await render(<StopRow stop={stop} routes={routes} meters={null} isFavorite onToggleFavorite={jest.fn()} />);
    screen.getByLabelText('Remove LAGOON DR + IOLANA PL from favorites');
  });

  it('renders with no routes serving the stop', async () => {
    await render(<StopRow stop={stop} routes={[]} meters={null} isFavorite={false} onToggleFavorite={jest.fn()} />);
    screen.getByText('LAGOON DR + IOLANA PL');
    expect(screen.queryByText('19')).toBeNull();
  });

  it('renders an unusually long stop name in full', async () => {
    const longName =
      'KAMEHAMEHA HIGHWAY + WAIAHOLE VALLEY ROAD PARK AND RIDE PEDESTRIAN CROSSING';
    await render(
      <StopRow
        stop={{ ...stop, stop_name: longName }}
        routes={routes}
        meters={null}
        isFavorite={false}
        onToggleFavorite={jest.fn()}
      />,
    );
    screen.getByText(longName);
  });

  it('falls back to the stop id when stop_code is blank', async () => {
    await render(
      <StopRow
        stop={{ ...stop, stop_code: '' }}
        routes={routes}
        meters={null}
        isFavorite={false}
        onToggleFavorite={jest.fn()}
      />,
    );
    screen.getByText('Stop 5');
  });
});
