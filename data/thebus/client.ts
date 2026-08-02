import { schedule } from '../../lib/schedule';
import { parseArrivals } from './parse';
import type { ArrivalsResult } from './types';

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

/**
 * Reads the AppID from the environment. `EXPO_PUBLIC_` means it is inlined
 * into the bundle at build time and is extractable from the `.ipa` — an
 * accepted, documented tradeoff, not an oversight.
 *
 * The quota it spends is per AppID and shared across every install, which is
 * why withCache exists. See the comparison spec dated 2026-08-02.
 */
export function appIdFromEnv(): string {
  return process.env.EXPO_PUBLIC_THEBUS_APP_ID ?? '';
}

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
      // carries the AppID — which is shared across every install and
      // rate-limited as one, so it must not reach a log or a screen.
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

  return { arrivals };
}
