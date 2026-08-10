import { schedule } from '../../lib/schedule';
import { parseArrivals } from './parse';
import { parseVehicles } from './vehicles';
import type { ArrivalsResult, FleetResult } from './types';

/**
 * The one place in the app that talks to the network.
 *
 * `TheBusClient` is an interface so that screens depend on the question they
 * are asking — "what is coming to this stop?" — rather than on a vendor whose
 * JSON is string-typed throughout and whose errors arrive as HTTP 200. Tests
 * and, later, a map view can substitute their own implementation without
 * touching a URL.
 */

/**
 * The part of `Response` this client uses. Structural, so the platform
 * `fetch` satisfies it without a cast and a test can supply a plain object.
 */
export type HttpResponse = {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
};

export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<HttpResponse>;

export interface TheBusClient {
  /**
   * Arrivals for one stop. `stopCode` is the number printed on the physical
   * stop sign — `stops.stop_code` in the bundled GTFS asset.
   *
   * Never rejects. Every outcome, including an outage, comes back as an
   * `ArrivalsResult`, because "couldn't reach the API" is a state the arrival
   * board has to render rather than an exception it has to survive.
   *
   * `fresh` means "do not answer me from a cache" — a pull-to-refresh. The
   * network client itself has no cache and ignores it; `withCache` is what
   * reads it. It lives on the interface rather than on the wrapper so that a
   * screen can express the intent without knowing whether it is talking to a
   * cached client or a bare one.
   */
  arrivals(
    stopCode: string,
    options?: { signal?: AbortSignal; fresh?: boolean },
  ): Promise<ArrivalsResult>;

  /**
   * Every bus on Oahu, in one request.
   *
   * **No parameters beyond the key, deliberately.** `route=` does not filter —
   * verified live: `?route=1` returns the identical 1,184 vehicles — so asking
   * for one route would spend a request to receive the whole fleet anyway while
   * implying a narrowing the server never performed. Filtering is the caller's,
   * and `features/map/useVehicles.ts` is where it happens.
   *
   * Never rejects. Like `arrivals`, every outcome including an outage comes
   * back as a result, because "couldn't reach the API" is something the map has
   * to render rather than something it has to survive.
   *
   * **Most of what comes back is dead.** Roughly 950 of those vehicles last
   * reported years ago and carry entirely plausible Oahu coordinates. Nothing
   * here filters them: the freshness rule needs `serverTime`, and keeping it in
   * one place — applied in both directions, so a bus leaves the map the same way
   * it arrives — is worth more than trimming the array early.
   */
  vehicles(options?: { signal?: AbortSignal }): Promise<FleetResult>;
}

export type TheBusClientConfig = {
  appId: string;
  baseUrl?: string;
  /** Per attempt, not for the call as a whole. */
  timeoutMs?: number;
  retryDelayMs?: number;
  fetch?: FetchLike;
};

/**
 * `https`, though the vendor documents only `http`. iOS App Transport
 * Security blocks cleartext, so the documented URL fails on a device while
 * working in Node; the TLS host is verified and serves every endpoint.
 */
const BASE_URL = 'https://api.thebus.org';
const TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 1_000;

/** One retry, so two attempts in total. */
const ATTEMPTS = 2;

const unreachable: ArrivalsResult = { ok: false, failure: { kind: 'unreachable' } };
const fleetUnreachable: FleetResult = { ok: false, failure: { kind: 'unreachable' } };

function isJson(response: HttpResponse): boolean {
  return response.headers.get('content-type')?.includes('json') ?? false;
}

export function createTheBusClient(config: TheBusClientConfig): TheBusClient {
  const {
    appId,
    baseUrl = BASE_URL,
    timeoutMs = TIMEOUT_MS,
    retryDelayMs = RETRY_DELAY_MS,
    fetch: fetchImpl = globalThis.fetch,
  } = config;

  /**
   * One attempt, bounded by `timeoutMs`.
   *
   * The timeout is enforced here rather than left to the platform because
   * roughly one request in sixty to this host simply never answers — no error,
   * no body. Without a bound, a 60-second poll would stack pending requests.
   *
   * Returning `null` means "no usable answer, and trying again might help".
   * A response that arrives and is merely wrong is not this function's
   * business — it comes back as an `HttpResponse` for the caller to read.
   */
  async function attempt(url: string, signal?: AbortSignal): Promise<HttpResponse | null> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort);
    const cancelTimeout = schedule(abort, timeoutMs);

    try {
      return await fetchImpl(url, { signal: controller.signal });
    } catch {
      // Deliberately swallowed rather than rethrown or logged. The rejection
      // reason from `fetch` can contain the full request URL, and that URL
      // carries the AppID — now the user's own credential, read out of the
      // keychain, which makes keeping it out of logs and screens a stronger
      // obligation than it was when every install shared one.
      return null;
    } finally {
      cancelTimeout();
      signal?.removeEventListener('abort', abort);
    }
  }

  async function arrivals(
    stopCode: string,
    options?: { signal?: AbortSignal },
  ): Promise<ArrivalsResult> {
    const url =
      `${baseUrl}/arrivalsJSON/?key=${encodeURIComponent(appId)}` +
      `&stop=${encodeURIComponent(stopCode)}`;

    for (let remaining = ATTEMPTS; remaining > 0; remaining -= 1) {
      if (options?.signal?.aborted) return unreachable;

      const response = await attempt(url, options?.signal);

      if (response !== null) {
        // A 404 is an IIS HTML page and a 5xx has no body worth reading;
        // neither is the vendor answering, so both are outages. The
        // content-type check is what keeps `JSON.parse` from throwing on that
        // HTML and turning an outage into a crash.
        if (response.ok && isJson(response)) {
          const text = await response.text();
          try {
            return parseArrivals(JSON.parse(text));
          } catch {
            // Well-formed HTTP carrying malformed JSON. Retrying will not fix
            // it, and it is not an outage.
            return { ok: false, failure: { kind: 'malformed' } };
          }
        }
        // A 4xx is the server's settled answer — a wrong path, a rejected
        // request — and asking again produces the same page while spending
        // another request against a quota shared by every install. Only a 5xx
        // and a dropped connection are worth a second attempt.
        if (response.status >= 400 && response.status < 500) return unreachable;
      }

      const last = remaining === 1;
      if (last || options?.signal?.aborted) break;
      await new Promise<void>((resolve) => schedule(resolve, retryDelayMs));
    }

    return unreachable;
  }

  /**
   * The fleet, as XML.
   *
   * **No content-type check, unlike `arrivals`.** That check exists there to
   * stop `JSON.parse` throwing on an IIS HTML error page; here `parseVehicles`
   * recognises its own document instead — a body with neither `<vehicles>` nor
   * `<errorMessage>` is `malformed` — which classifies the same page without
   * depending on a header. The vendor documents this endpoint as XML only and
   * there is no working JSON form.
   */
  async function vehicles(options?: { signal?: AbortSignal }): Promise<FleetResult> {
    const url = `${baseUrl}/vehicle/?key=${encodeURIComponent(appId)}`;

    for (let remaining = ATTEMPTS; remaining > 0; remaining -= 1) {
      if (options?.signal?.aborted) return fleetUnreachable;

      const response = await attempt(url, options?.signal);

      if (response !== null) {
        if (response.ok) return parseVehicles(await response.text());
        // A 4xx is the server's settled answer; only a 5xx and a dropped
        // connection are worth a second attempt. Same reasoning as `arrivals`.
        if (response.status >= 400 && response.status < 500) return fleetUnreachable;
      }

      const last = remaining === 1;
      if (last || options?.signal?.aborted) break;
      await new Promise<void>((resolve) => schedule(resolve, retryDelayMs));
    }

    return fleetUnreachable;
  }

  return { arrivals, vehicles };
}
