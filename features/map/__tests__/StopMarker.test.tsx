import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { StopMarker } from '../StopMarker';
import { TestTheme } from '../../../lib/testing/theme';
import type { StopWithDistance } from '../../../data/gtfs/types';

/**
 * The marker's *geometry* rather than its looks, because looks are not testable
 * here and geometry is what has bitten this project.
 *
 * Two invariants matter and both are recorded in the component's own header:
 * the wrapper box is what MapKit hit-tests and what `reactSetFrame:` reads to
 * place the marker's center, and children of a `react-native-maps` marker are
 * never conditionally mounted.
 */

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    Marker: ({ identifier, accessibilityLabel, children }: any) => (
      <View accessibilityLabel={accessibilityLabel} testID={identifier}>
        {children}
      </View>
    ),
  };
});

const STOP: StopWithDistance = {
  stop_id: '4104',
  stop_code: '4104',
  stop_name: 'HUNAKAI ST + WAIALAE AVE',
  lat: 21.278,
  lon: -157.797,
  meters: 120,
};

/**
 * The marker's own wrapper view — the box MapKit hit-tests and the box
 * `reactSetFrame:` reads to place the marker's center.
 *
 * It throws rather than returning undefined, because every test here is *about*
 * that box: one that had quietly gone missing must fail the test rather than
 * flow into an assertion as `undefined`.
 */
function wrapperOf(testID: string) {
  const wrap = screen.getByTestId(testID).children[0];
  if (wrap === undefined || typeof wrap === 'string') {
    throw new Error(`marker ${testID} rendered no wrapper view`);
  }
  return wrap;
}

describe('StopMarker', () => {
  /**
   * The whole reason the tile shrinks and the wrapper does not. MapKit
   * hit-tests annotation views by frame, so a box that tracked the dot would
   * make every stop untappable at exactly the zoom where they are already
   * hardest to hit — and `reactSetFrame:` would shift each marker's center as
   * well, moving forty pins off their stops.
   */
  it.each(['route', 'street'] as const)(
    'keeps the same tap target at %s scale',
    async (scale) => {
      await render(
        <TestTheme>
          <StopMarker
            stop={STOP}
            selected={false}
            placement={null}
            scale={scale}
            onPress={() => {}}
          />
        </TestTheme>,
      );

      const style = StyleSheet.flatten(wrapperOf('4104').props.style);

      expect(style.width).toBe(34);
      expect(style.height).toBe(34);
    },
  );

  /**
   * Not a style preference. Mounting and unmounting a child inside a
   * `react-native-maps` marker is a mount instruction against a view whose
   * subviews belong to MapKit — the family the SIGABRT and the
   * markers-teleporting-to-the-corner bug both came from. Crossing the scale
   * threshold would issue it for every marker on screen at once.
   */
  it('mounts its name at route scale rather than dropping it', async () => {
    await render(
      <TestTheme>
        <StopMarker
          stop={STOP}
          selected={false}
          placement={null}
          scale="route"
          onPress={() => {}}
        />
      </TestTheme>,
    );

    expect(screen.getByText('HUNAKAI ST + WAIALAE AVE')).toBeTruthy();
  });

  /** A selected stop is still named at route scale, so it needs something to belong to. */
  it('draws the selected stop larger than its neighbours at route scale', async () => {
    const sizeOf = async (selected: boolean) => {
      const view = await render(
        <TestTheme>
          <StopMarker
            stop={STOP}
            selected={selected}
            placement={null}
            scale="route"
            onPress={() => {}}
          />
        </TestTheme>,
      );
      const tile = wrapperOf('4104').props.children[0];
      const size = StyleSheet.flatten(tile.props.style).width;
      await view.unmount();
      return size;
    };

    expect(await sizeOf(true)).toBeGreaterThan(Number(await sizeOf(false)));
  });
});
