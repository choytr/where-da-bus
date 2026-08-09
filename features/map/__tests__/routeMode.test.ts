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

  it('does nothing when asked to flip or leave with no route showing', async () => {
    const { result } = await renderHook(() => useRouteMode());

    await act(async () => flipDirection());
    await act(async () => leaveRouteMode());

    expect(result.current).toBeNull();
  });
});
