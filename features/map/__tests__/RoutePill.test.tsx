import { fireEvent, render, screen } from '@testing-library/react-native';
import { RoutePill } from '../RoutePill';
import { TestTheme } from '../../../lib/testing/theme';
import { ATTRIBUTION } from '../../../lib/legal';

/**
 * What the map is showing, said on the map. The sheet's band says it too, and
 * is out of sight the moment a rider raises the sheet over it or simply looks
 * at the map — which is exactly when the question gets asked.
 */
describe('RoutePill', () => {
  it('names the route by the number on the bus', async () => {
    await render(
      <TestTheme>
        <RoutePill routeName="32" top={100} onClose={() => {}} />
      </TestTheme>,
    );

    expect(screen.getByText('Route 32')).toBeTruthy();
  });

  /**
   * The pill is on screen a query before the route's row arrives, so that the
   * name landing does not push ⌖ and the compass down in a visible shudder. The
   * sheet's band reads the same way for the same moment.
   */
  it('reads plain “Route” while the route’s row is still loading', async () => {
    await render(
      <TestTheme>
        <RoutePill routeName={null} top={100} onClose={() => {}} />
      </TestTheme>,
    );

    expect(screen.getByText('Route')).toBeTruthy();
  });

  it('leaves route mode from its own X', async () => {
    const onClose = jest.fn();
    await render(
      <TestTheme>
        <RoutePill routeName="32" top={100} onClose={onClose} />
      </TestTheme>,
    );

    await fireEvent.press(screen.getByLabelText('Stop showing this route'));

    expect(onClose).toHaveBeenCalled();
  });

  /**
   * **Settled, and not a compliance gap.** A pill presents OTS data on the map
   * surface and carries no legend, on the same grounds the sheet's peek does
   * not: the sheet carries it for the same data, one detent away. Raised twice
   * and ruled on twice — *"That's honestly fine."* This test exists so the
   * absence reads as a decision rather than as an oversight nobody checked.
   */
  it('carries no attribution legend, by decision', async () => {
    await render(
      <TestTheme>
        <RoutePill routeName="32" top={100} onClose={() => {}} />
      </TestTheme>,
    );

    expect(screen.queryByText(ATTRIBUTION)).toBeNull();
  });
});
