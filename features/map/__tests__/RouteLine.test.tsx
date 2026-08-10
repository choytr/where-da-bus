import { render, screen } from '@testing-library/react-native';
import { RouteLine } from '../RouteLine';
import { Text } from 'react-native';
import { TestTheme } from '../../../lib/testing/theme';
import { useTheme } from '../../../lib/theme';

/**
 * Reports the two colours this file is about, from the real palette.
 *
 * The palette itself is deliberately not exported — a test reaching into it
 * would let app code do the same. Reading it through the hook keeps the module
 * surface unchanged and still compares against the real values rather than
 * against literals a refresh would silently invalidate.
 */
function PaletteProbe() {
  const { palette } = useTheme();
  return <Text>{`route=${palette.route} pin=${palette.pin}`}</Text>;
}

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    __esModule: true,
    Polyline: ({ coordinates, strokeColor, testID }: any) => (
      <View testID={testID}>
        <Text>{`points: ${coordinates.length}`}</Text>
        <Text>{`stroke: ${strokeColor}`}</Text>
      </View>
    ),
  };
});

const draw = (points: { lat: number; lon: number }[]) =>
  render(
    <TestTheme>
      <RouteLine points={points} />
      <PaletteProbe />
    </TestTheme>,
  );

/** The palette's own values, read back out of the rendered probe. */
function colours() {
  const probe = screen.getByText(/^route=/).props.children;
  const match = /^route=(\S+) pin=(\S+)$/.exec(probe);
  if (match === null) throw new Error(`unreadable probe: ${probe}`);
  return { route: match[1], pin: match[2] };
}

describe('RouteLine', () => {
  /**
   * The rule the map section of `docs/backlog.md` exists for. Route mode changes
   * this overlay's coordinates, never its presence — mounting and unmounting a
   * child inside a `react-native-maps` component is the seam with a SIGABRT
   * behind it.
   */
  it('is mounted even when there is no route to draw', async () => {
    await draw([]);

    expect(screen.getByTestId('route-line')).toBeTruthy();
    expect(screen.getByText('points: 0')).toBeTruthy();
  });

  it('converts the asset’s points into the map’s coordinates', async () => {
    await draw([
      { lat: 21.33, lon: -157.87 },
      { lat: 21.28, lon: -157.83 },
    ]);

    expect(screen.getByText('points: 2')).toBeTruthy();
  });

  /**
   * It was the pins' blue, on the reasoning that a line and the stops on it
   * should read as one thing. Device round 1 put a blue line under blue pins on
   * Apple's blue roads and Truman asked for red. Asserted against the token
   * rather than a literal so the colour stays tunable, and asserted at all so
   * nobody "unifies" the two again.
   */
  it('is drawn in the route colour, not the pins’', async () => {
    await draw([{ lat: 21.33, lon: -157.87 }]);
    const { route, pin } = colours();

    expect(route).not.toBe(pin);
    expect(screen.getByText(`stroke: ${route}`)).toBeTruthy();
  });
});
