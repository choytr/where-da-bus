import { appIdFromEnv, createTheBusClient } from './client';

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
export { hawaiiDateTime, hawaiiTimestamp } from './time';

/**
 * The app's one client. A single instance is what keeps the connection alive
 * across polls, and there is only ever one AppID to spend.
 *
 * Screens take a client as an argument and default to this, so a test can
 * substitute its own without touching the network or the environment.
 */
export const theBus = createTheBusClient({ appId: appIdFromEnv() });
