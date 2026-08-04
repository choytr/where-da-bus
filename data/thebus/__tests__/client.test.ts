import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTheBusClient, type HttpResponse } from '../client';

/**
 * The network half of the boundary: URL construction, the fact that errors
 * arrive as HTTP 200, and the failures that have nothing to do with the
 * vendor's JSON at all — a 404 HTML page, a dropped connection, a timeout.
 *
 * `fetch` is injected rather than mocked globally, so these tests describe the
 * client's contract instead of a mocking framework's.
 */

const APP_ID = 'test-app-id-0000';

const json = (body: unknown, status = 200): HttpResponse => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
  text: async () => JSON.stringify(body),
});

/**
 * The real IIS error page, captured from a live 404 rather than approximated.
 * It is what `/vehicleJSON/` and every unknown path return, and the point of
 * using the genuine article is that it is 1,245 bytes of HTML with an
 * unhelpful `text/html` content-type — exactly what `res.json()` chokes on.
 */
const NOT_FOUND_BODY = readFileSync(join(__dirname, 'fixtures/not-found.html'), 'utf8');

const html = (status: number): HttpResponse => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'text/html' : null) },
  text: async () => NOT_FOUND_BODY,
});

const board = {
  stop: '45',
  timestamp: '8/1/2026 10:35:40 PM',
  arrivals: [
    {
      id: '1', trip: 't', route: '2', headsign: 'WAIKIKI', direction: 'Westbound',
      vehicle: '240', estimated: '1', stopTime: '10:45 PM', date: '8/1/2026',
      latitude: '21.29965', longitude: '-157.85314', shape: 's', canceled: '0',
    },
  ],
};

describe('createTheBusClient', () => {
  it('asks the HTTPS host for the stop, with the key attached', async () => {
    const calls: string[] = [];
    const client = createTheBusClient({
      appId: APP_ID,
      fetch: async (url) => {
        calls.push(url);
        return json(board);
      },
    });

    await client.arrivals('45');

    expect(calls).toHaveLength(1);
    // https, not the http:// the vendor documents — iOS App Transport
    // Security blocks cleartext, and the TLS host works.
    expect(calls[0]).toMatch(/^https:\/\/api\.thebus\.org\/arrivalsJSON\/\?/);
    expect(calls[0]).toContain(`key=${APP_ID}`);
    expect(calls[0]).toContain('stop=45');
  });

  it('percent-encodes a stop code rather than pasting it into the URL', async () => {
    const calls: string[] = [];
    const client = createTheBusClient({
      appId: APP_ID,
      fetch: async (url) => {
        calls.push(url);
        return json(board);
      },
    });

    await client.arrivals('4 5&key=other');

    expect(calls[0]).toContain('stop=4%205%26key%3Dother');
  });

  it('returns a parsed board on success', async () => {
    const client = createTheBusClient({ appId: APP_ID, fetch: async () => json(board) });

    const result = await client.arrivals('45');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.board.stopCode).toBe('45');
    expect(result.board.arrivals).toHaveLength(1);
    expect(result.board.arrivals[0].estimate).toBe('live');
  });

  it('reads an error body even though it arrives as HTTP 200', async () => {
    // The status line carries no signal at all on this API, which is the whole
    // point of this test. A stop-shaped error keeps it about that rather than
    // about the key: the key case is its own kind now, asserted below.
    const client = createTheBusClient({
      appId: APP_ID,
      fetch: async () => json({ errorMessage: 'Invalid or unspecified stop ID' }),
    });

    const result = await client.arrivals('45');

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'api', message: 'Invalid or unspecified stop ID' },
    });
  });

  it('reports a rejected key as unauthorized, all the way through the client', async () => {
    const client = createTheBusClient({
      appId: 'not-a-registered-key',
      fetch: async () => json({ errorMessage: 'Invalid or unspecified API key' }),
    });

    const result = await client.arrivals('45');

    expect(result).toEqual({ ok: false, failure: { kind: 'unauthorized' } });
  });

  it('does not retry an API error, which is a definitive answer', async () => {
    let attempts = 0;
    const client = createTheBusClient({
      appId: APP_ID,
      fetch: async () => {
        attempts += 1;
        return json({ errorMessage: 'Invalid or unspecified stop ID' });
      },
    });

    await client.arrivals('45');

    expect(attempts).toBe(1);
  });

  it('treats a 404 HTML page as unreachable rather than crashing on the parse', async () => {
    // Unknown paths return a 1,245-byte IIS error page. Calling res.json() on
    // it throws a SyntaxError, which would surface as a crash rather than as
    // the outage it actually is.
    let attempts = 0;
    const client = createTheBusClient({
      appId: APP_ID,
      retryDelayMs: 0,
      fetch: async () => {
        attempts += 1;
        return html(404);
      },
    });

    const result = await client.arrivals('45');

    expect(result).toEqual({ ok: false, failure: { kind: 'unreachable' } });
    // A 404 is settled. Asking again returns the same page and spends another
    // request against a quota shared by every install.
    expect(attempts).toBe(1);
  });

  it('retries a 5xx, which may pass, before calling it unreachable', async () => {
    let attempts = 0;
    const client = createTheBusClient({
      appId: APP_ID,
      retryDelayMs: 0,
      fetch: async () => {
        attempts += 1;
        return html(503);
      },
    });

    expect(await client.arrivals('45')).toEqual({
      ok: false,
      failure: { kind: 'unreachable' },
    });
    expect(attempts).toBe(2);
  });

  it('treats a JSON 200 that is not a board as malformed, not as an outage', async () => {
    // A vendor-side format change must be distinguishable from the network
    // being down, or it gets misdiagnosed for as long as it lasts.
    const client = createTheBusClient({
      appId: APP_ID,
      fetch: async () => json({ unexpected: true }),
    });

    expect(await client.arrivals('45')).toEqual({
      ok: false,
      failure: { kind: 'malformed' },
    });
  });

  it('retries a dropped request once, and succeeds on the retry', async () => {
    // Roughly one request in sixty simply never answers. On a 60-second poll
    // that is visible to a rider, so one retry is worth its cost.
    let attempts = 0;
    const client = createTheBusClient({
      appId: APP_ID,
      retryDelayMs: 0,
      fetch: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('network request failed');
        return json(board);
      },
    });

    const result = await client.arrivals('45');

    expect(attempts).toBe(2);
    expect(result.ok).toBe(true);
  });

  it('gives up as unreachable when every attempt drops', async () => {
    let attempts = 0;
    const client = createTheBusClient({
      appId: APP_ID,
      retryDelayMs: 0,
      fetch: async () => {
        attempts += 1;
        throw new Error('network request failed');
      },
    });

    const result = await client.arrivals('45');

    expect(attempts).toBe(2);
    expect(result).toEqual({ ok: false, failure: { kind: 'unreachable' } });
  });

  it('stops immediately when the caller aborts, without retrying', async () => {
    // The poll is cancelled on unmount and on backgrounding. Retrying after
    // the caller has walked away wastes a request against a shared quota.
    const controller = new AbortController();
    let attempts = 0;
    const client = createTheBusClient({
      appId: APP_ID,
      retryDelayMs: 0,
      fetch: async () => {
        attempts += 1;
        controller.abort();
        throw new Error('Aborted');
      },
    });

    const result = await client.arrivals('45', { signal: controller.signal });

    expect(attempts).toBe(1);
    expect(result).toEqual({ ok: false, failure: { kind: 'unreachable' } });
  });

  it('never puts the key in a failure it hands back', async () => {
    // Failures reach the screen and the logs. The AppID is shared across every
    // install and rate-limited as one, so it does not belong in either.
    const client = createTheBusClient({
      appId: APP_ID,
      retryDelayMs: 0,
      fetch: async () => {
        throw new Error(`request to https://api.thebus.org/?key=${APP_ID} failed`);
      },
    });

    const result = await client.arrivals('45');

    expect(JSON.stringify(result)).not.toContain(APP_ID);
  });

  it('abandons a request that never answers', async () => {
    jest.useFakeTimers();
    try {
      const client = createTheBusClient({
        appId: APP_ID,
        timeoutMs: 10_000,
        retryDelayMs: 0,
        fetch: (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
          }),
      });

      const pending = client.arrivals('45');
      await jest.advanceTimersByTimeAsync(30_000);

      expect(await pending).toEqual({ ok: false, failure: { kind: 'unreachable' } });
    } finally {
      jest.useRealTimers();
    }
  });
});
