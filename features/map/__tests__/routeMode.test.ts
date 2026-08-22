import { renderHook, act } from '@testing-library/react-native';
import { enterRouteMode, flipDirection, leaveRouteMode, useRouteMode } from '../routeMode';

/**
 * The store exists so that "leaving the tab and coming back does not drop route
 * mode" is a fact rather than a bet on whether React Navigation keeps a tab
 * scene mounted. These tests are about that property and the three transitions
 * that reach it.
 */
beforeEach(() => {
  leaveRouteMode();
});

describe('routeMode', () => {
  it('starts with no route showing', async () => {
    const { result } = await renderHook(() => useRouteMode());

    expect(result.current).toBeNull();
  });

  it('draws the route it is given, from its first direction', async () => {
    const { result } = await renderHook(() => useRouteMode());

    await act(async () => enterRouteMode('25'));

    expect(result.current).toEqual({ routeId: '25', directionIndex: 0 });
  });

  /**
   * The reason this is not `MapScreen` state. A tab scene being unmounted and
   * remounted must not take the route with it — Truman settled that explicitly.
   */
  it('survives the component that reads it being unmounted', async () => {
    const first = await renderHook(() => useRouteMode());
    await act(async () => enterRouteMode('25'));
    await first.unmount();

    const second = await renderHook(() => useRouteMode());

    expect(second.result.current).toEqual({ routeId: '25', directionIndex: 0 });
  });

  it('flips to the other direction and back', async () => {
    const { result } = await renderHook(() => useRouteMode());
    await act(async () => enterRouteMode('25'));

    await act(async () => flipDirection());
    expect(result.current?.directionIndex).toBe(1);

    await act(async () => flipDirection());
    expect(result.current?.directionIndex).toBe(0);
  });

  it('leaves route mode entirely', async () => {
    const { result } = await renderHook(() => useRouteMode());
    await act(async () => enterRouteMode('25'));

    await act(async () => leaveRouteMode());

    expect(result.current).toBeNull();
  });

  /**
   * Tapping the route already showing must not throw a rider back to the
   * direction they just turned away from.
   */
  it('keeps the direction when the route already showing is picked again', async () => {
    const { result } = await renderHook(() => useRouteMode());
    await act(async () => enterRouteMode('25'));
    await act(async () => flipDirection());

    await act(async () => enterRouteMode('25'));

    expect(result.current?.directionIndex).toBe(1);
  });

  it('starts a different route from its first direction', async () => {
    const { result } = await renderHook(() => useRouteMode());
    await act(async () => enterRouteMode('25'));
    await act(async () => flipDirection());

    await act(async () => enterRouteMode('13'));

    expect(result.current).toEqual({ routeId: '13', directionIndex: 0 });
  });

  /**
   * The round-4 bug, in one test. Every entry point opened at direction 0 while
   * the map hides the other direction's buses by design, so a rider tapping a
   * live arrival travelling the other way got a map that had deliberately
   * hidden the bus the row promised.
   */
  it('opens a route in the direction the caller names', async () => {
    const { result } = await renderHook(() => useRouteMode());

    await act(async () => enterRouteMode('25', 1));

    expect(result.current).toEqual({ routeId: '25', directionIndex: 1 });
  });

  /**
   * And it has to work on the route already showing, which is where the early
   * return used to make this unfixable by tapping again: a rider whose first
   * tap opened the wrong way could tap a second row on the same route forever
   * and never turn the map round.
   */
  it('turns the route already showing when the caller names a direction', async () => {
    const { result } = await renderHook(() => useRouteMode());
    await act(async () => enterRouteMode('25'));

    await act(async () => enterRouteMode('25', 1));

    expect(result.current?.directionIndex).toBe(1);
  });

  /**
   * The other half of the same rule: *no* opinion still means no opinion. The
   * route chips and the search results pass nothing, and must not drag a rider
   * off the direction they turned to themselves.
   */
  it('still keeps the direction when the caller names none', async () => {
    const { result } = await renderHook(() => useRouteMode());
    await act(async () => enterRouteMode('25'));
    await act(async () => flipDirection());

    await act(async () => enterRouteMode('25'));

    expect(result.current?.directionIndex).toBe(1);
  });

  it('does nothing when asked to flip or leave with no route showing', async () => {
    const { result } = await renderHook(() => useRouteMode());

    await act(async () => flipDirection());
    await act(async () => leaveRouteMode());

    expect(result.current).toBeNull();
  });
});
