export type {
  Arrival,
  ArrivalBoard,
  ArrivalEstimate,
  ArrivalsFailure,
  ArrivalsResult,
  Coords,
} from './types';
export type { FetchLike, HttpResponse, TheBusClient, TheBusClientConfig } from './client';
export { createTheBusClient } from './client';
export { parseArrivals } from './parse';
export { withCache } from './cache';
export { hawaiiDateTime, hawaiiTimestamp } from './time';

/**
 * There is no module-level client any more.
 *
 * Until Increment 4 this file ended with
 * `export const theBus = withCache(createTheBusClient({ appId: appIdFromEnv() }))`
 * — one instance, built at import time from an environment variable inlined
 * into the bundle. That cannot survive a key the user owns and can replace:
 * an AppID fixed at import is one the app can only change by relaunching.
 *
 * `TheBusProvider` holds the key and rebuilds the client whenever it changes,
 * which is also what gives each key its own `withCache` cache. Screens take a
 * client rather than reaching for a shared one, and the components that mount
 * them read it from `useTheBus()`.
 */
export { TheBusProvider, useTheBus } from './provider';
export type { ApiKeyStorage, TheBus } from './provider';
