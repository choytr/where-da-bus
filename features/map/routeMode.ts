import { useSyncExternalStore } from 'react';

/**
 * Which route the map is drawing, and in which direction.
 *
 * **Module state rather than `MapScreen`'s state, deliberately.** Truman settled
 * that leaving the tab and coming back does not drop route mode. Holding it in
 * the screen makes that a bet on whether React Navigation keeps a tab scene
 * mounted — an unmeasured native behaviour, which is the exact class of thing
 * this project has now got wrong six times (see `docs/handoff.md`). Fifteen
 * lines make it certain instead, and the device round gets to spend itself on
 * something that actually needs a device.
 *
 * It is *not* a route in the expo-router sense. The map stays at `/`, because
 * route mode is a state of the map rather than a screen: the whole point of the
 * increment is that picking a route no longer navigates away.
 */

export type RouteMode = {
  readonly routeId: string;
  /**
   * Which of the route's directions is drawn, as an index into
   * `routeStops(routeId)`'s result rather than GTFS's `direction_id`.
   *
   * An index because this store does not know how many directions a route has —
   * most have two and some have one — so the consumer clamps it. Storing
   * `direction_id` would mean storing a value that might not exist in the feed.
   */
  readonly directionIndex: number;
};

let current: RouteMode | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): RouteMode | null {
  return current;
}

function set(next: RouteMode | null): void {
  // `useSyncExternalStore` compares snapshots by identity, so handing out a
  // fresh object for an unchanged value would re-render every subscriber.
  if (current === next) return;
  current = next;
  for (const listener of listeners) listener();
}

export function useRouteMode(): RouteMode | null {
  return useSyncExternalStore(subscribe, snapshot);
}

/**
 * Draw `routeId`, starting at its first direction.
 *
 * Re-entering the route already showing is a no-op rather than a reset, so
 * tapping the same route chip twice does not flip a rider back to the direction
 * they just turned away from.
 */
export function enterRouteMode(routeId: string): void {
  if (current?.routeId === routeId) return;
  set({ routeId, directionIndex: 0 });
}

/** The other direction. A route with only one is the consumer's clamp to make. */
export function flipDirection(): void {
  if (current === null) return;
  set({ routeId: current.routeId, directionIndex: current.directionIndex === 0 ? 1 : 0 });
}

/** The X, and the only thing that leaves. Panning does not; changing tab does not. */
export function leaveRouteMode(): void {
  set(null);
}
