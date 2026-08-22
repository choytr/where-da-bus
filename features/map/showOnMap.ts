import { useSyncExternalStore } from 'react';
import { router } from 'expo-router';
import { enterRouteMode } from './routeMode';

/**
 * *Show me that on the map* — asked from anywhere, answered by `MapScreen`.
 *
 * Four rows across the app long-press into this: a stop, a route, and a live
 * bus. They are one idea wearing three hats, and it is the spine of Increment 9.
 *
 * **Module state and a tab switch, not a route parameter.** Showing something
 * on the map is not a new screen — the map is a screen a rider already has, in
 * a state they already understand — so this switches to the Map tab rather than
 * pushing `/map?stop=…` onto whatever stack the row was in. Truman confirmed
 * the tab switch explicitly. The same reasoning, and the same fifteen lines, as
 * `routeMode`, which this deliberately mirrors.
 *
 * **A request is consumed once.** `MapScreen` takes it, acts on it and clears
 * it, so a rider who leaves the Map tab and comes back an hour later is not
 * thrown to a stop they looked up once. Route mode, by contrast, persists — it
 * is a state of the map rather than an instruction to it.
 */

export type MapRequest =
  /** Anchor here, frame the camera and open this stop's card. */
  | { readonly kind: 'stop'; readonly stopId: string }
  /**
   * Draw this route. Carries `route_id`, because that is what `routeMode` and
   * every GTFS query key on.
   */
  | { readonly kind: 'route'; readonly routeId: string }
  /**
   * Draw the route an arrival is for, from the stop it was read at.
   *
   * Carries the route's **`short_name`**, not its id, because that is all an
   * `Arrival` has — and `MapScreen` is the one place that has to translate,
   * rather than every row growing a query of its own.
   *
   * `tripId` is what joins an arrival to a drawn bus. Given, the map opens the
   * stop's card and selects that arrival, which is the state where the bus is
   * drawn larger and keeps its number at any zoom. **Null asks for the route
   * alone**, which is the entry every arrival gets — the bus entry is offered
   * only where one is actually reporting.
   */
  | {
      readonly kind: 'arrival';
      readonly routeName: string;
      readonly tripId: string | null;
      /**
       * The sign on the front of the bus, which is what tells the map **which
       * way** to open.
       *
       * Every entry point used to open at direction 0, and the map hides the
       * other direction's buses by design — so half the live rows led to a map
       * that had deliberately hidden the bus they promised. `directionIndexFor`
       * turns this into a direction; null, or a sign the asset does not carry,
       * leaves the direction alone rather than guessing.
       */
      readonly headsign: string | null;
      /**
       * The stop the arrival was read at, whose card the map opens so the rider
       * lands on the board they came from. Null while that row is still being
       * resolved on `/stop/[code]`, in which case the route is drawn and no
       * card opens.
       */
      readonly stopId: string | null;
    };

let current: MapRequest | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): MapRequest | null {
  return current;
}

function set(next: MapRequest | null): void {
  // `useSyncExternalStore` compares by identity, so an unchanged value handed
  // out as a fresh object would re-render every subscriber.
  if (current === next) return;
  current = next;
  for (const listener of listeners) listener();
}

export function useMapRequest(): MapRequest | null {
  return useSyncExternalStore(subscribe, snapshot);
}

/** Taken by `MapScreen` once it has acted, so it cannot be acted on twice. */
export function clearMapRequest(): void {
  set(null);
}

/**
 * Ask the map to show `request`, and go there.
 *
 * The request is set *before* the navigation so the map, which may be mounting
 * for the first time, reads it on its first render rather than after a frame in
 * its default state.
 *
 * **Dismissing comes first, and leaving it out made this look broken.**
 * `/stop/[code]` and `/route/[id]` are pushed onto the *root* stack, over the
 * tab bar — so `navigate('/')` switched the tab underneath a screen that was
 * still covering it, and a rider tapping an arrival saw nothing happen at all
 * (Truman, 2026-08-21). `dismissAll` pops back to the tabs first; `canDismiss`
 * guards it, because there is nothing to pop when the row was already inside
 * the Map tab's own sheet.
 *
 * `navigate` rather than `push`: the Map tab is one screen and asking for it
 * twice must not stack two of it.
 */
export function showOnMap(request: MapRequest): void {
  // Route mode is entered here rather than in `MapScreen` for the one request
  // that can: it survives leaving the tab, so setting it at the source means
  // the map is already drawing the right route on its very first frame.
  if (request.kind === 'route') enterRouteMode(request.routeId);
  set(request);
  if (router.canDismiss()) router.dismissAll();
  router.navigate('/');
}
