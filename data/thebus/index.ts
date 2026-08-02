import { appIdFromEnv, createTheBusClient } from './client';
import { withCache } from './cache';

export type {
  Arrival,
  ArrivalBoard,
  ArrivalEstimate,
  ArrivalsFailure,
  ArrivalsResult,
  Coords,
} from './types';
export type { FetchLike, HttpResponse, TheBusClient, TheBusClientConfig } from './client';
export { appIdFromEnv, createTheBusClient } from './client';
export { parseArrivals } from './parse';
export { withCache } from './cache';
export { hawaiiDateTime, hawaiiTimestamp } from './time';

/**
 * The app's one client. A single instance is what keeps the connection alive
 * across polls, and there is only ever one AppID to spend.
 *
 * Wrapped in `withCache`, which is only meaningful because the instance is
 * shared: two screens asking the same question at the same time cost one
 * request, and a remount inside thirty seconds costs none. From Increment 3 on
 * that is a real situation rather than a hypothetical one — the map's expanded
 * row asks exactly what the arrival board asks.
 *
 * Screens take a client as an argument and default to this, so a test can
 * substitute its own without touching the network or the environment.
 */
export const theBus = withCache(createTheBusClient({ appId: appIdFromEnv() }));
