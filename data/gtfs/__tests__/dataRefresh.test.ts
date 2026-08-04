import AsyncStorage from '@react-native-async-storage/async-storage';
import { refreshStopData, sweepStaleGenerations, type RefreshDependencies } from '../dataRefresh';
import { MANIFEST_URL } from '../refresh';
import type { DatabaseFacts, DatabaseFiles } from '../files';
import { loadCurrentDatabase, loadLastChecked } from '../../storage/database';
import { SCHEMA_VERSION } from '../sql';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

/**
 * Every test here injects its own `DatabaseFiles`, so none of this is called —
 * but `dataRefresh.ts` imports the live one to use as a default parameter, and
 * that import alone pulls `expo-sqlite` in. Off a device it does not even load:
 * `expo-sqlite/build/hooks.js` requires `expo-asset`, which is not a dependency
 * of this project. Doubling the three native modules is what keeps this suite
 * about the refresh rather than about module resolution.
 */
jest.mock('expo-sqlite', () => ({
  defaultDatabaseDirectory: '/documents/SQLite',
  openDatabaseAsync: jest.fn(),
}));
jest.mock('expo-file-system', () => ({ Directory: jest.fn(), File: jest.fn() }));
jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digest: jest.fn() }));

const published = {
  schemaVersion: SCHEMA_VERSION,
  builtAt: '2026-08-10T12:00:00Z',
  file: `gtfs-v${SCHEMA_VERSION}-20260810T120000Z.db`,
  bytes: 1224704,
  sha256: 'sha(fresh bytes)',
  feedEndDate: '20260822',
};

const wholeFeed: DatabaseFacts = {
  schemaVersion: SCHEMA_VERSION,
  counts: { stops: 3830, routes: 118, stopRoutes: 8629 },
};

const NOW = new Date('2026-08-11T09:00:00.000Z');

function deps(overrides: { manifest?: unknown; ok?: boolean; facts?: DatabaseFacts } = {}) {
  const contents = new Map<string, string>([['gtfs.db', 'the floor']]);
  const downloads: string[] = [];

  const files: DatabaseFiles = {
    async download(_url, name) {
      downloads.push(name);
      contents.set(name, 'fresh bytes');
    },
    async sha256(name) {
      const body = contents.get(name);
      return body === undefined ? 'missing' : `sha(${body})`;
    },
    rename(from, to) {
      const body = contents.get(from);
      if (body === undefined) throw new Error(`rename of missing ${from}`);
      contents.delete(from);
      contents.set(to, body);
    },
    remove(name) {
      contents.delete(name);
    },
    list() {
      return [...contents.keys()];
    },
    async inspect() {
      return overrides.facts ?? wholeFeed;
    },
  };

  const dependencies: RefreshDependencies = {
    fetch: async (url) => {
      expect(url).toBe(MANIFEST_URL);
      const ok = overrides.ok ?? true;
      return { ok, status: ok ? 200 : 503, json: async () => overrides.manifest ?? published };
    },
    files,
    now: () => NOW,
  };

  return { dependencies, files, contents, downloads };
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('refreshStopData', () => {
  it('installs a newer build and points at it', async () => {
    const { dependencies, contents } = deps();

    expect(await refreshStopData(dependencies)).toEqual({
      state: 'installed',
      builtAt: published.builtAt,
    });
    expect(contents.has(published.file)).toBe(true);
    expect(await loadCurrentDatabase()).toEqual({
      file: published.file,
      builtAt: published.builtAt,
    });
  });

  it('does nothing when the installed build is already the published one', async () => {
    const first = deps();
    await refreshStopData(first.dependencies);

    const second = deps();
    expect(await refreshStopData(second.dependencies)).toEqual({ state: 'up-to-date' });
    expect(second.downloads).toEqual([]);
  });

  /**
   * "When did it last look" and "did it find anything" are different facts, and
   * Settings shows both. A timestamp written only on success would claim the
   * app had never checked after a week of failures — precisely backwards.
   */
  it('records the attempt whether it worked or not', async () => {
    const failing = deps({ ok: false });
    await expect(refreshStopData(failing.dependencies)).rejects.toThrow(/HTTP 503/);
    expect(await loadLastChecked()).toBe(NOW.toISOString());

    await AsyncStorage.clear();
    await refreshStopData(deps().dependencies);
    expect(await loadLastChecked()).toBe(NOW.toISOString());
  });

  it('leaves the pointer alone when the check fails', async () => {
    const { dependencies } = deps({ ok: false });

    await expect(refreshStopData(dependencies)).rejects.toThrow();
    expect(await loadCurrentDatabase()).toBeNull();
  });

  it('leaves the pointer alone when the download is too small to be a whole feed', async () => {
    const { dependencies, contents } = deps({
      facts: { schemaVersion: SCHEMA_VERSION, counts: { stops: 40, routes: 3, stopRoutes: 90 } },
    });

    await expect(refreshStopData(dependencies)).rejects.toThrow(/too small/);
    expect(await loadCurrentDatabase()).toBeNull();
    expect(contents.has(published.file)).toBe(false);
    expect(contents.get('gtfs.db')).toBe('the floor');
  });

  /**
   * Launch fires a check a moment after first paint, and Settings' Check now is
   * reachable well inside that window. Two concurrent runs would download to
   * the same .part file and one would rename what the other was still writing.
   */
  it('coalesces concurrent callers into one download', async () => {
    const { dependencies, downloads } = deps();

    const [a, b] = await Promise.all([
      refreshStopData(dependencies),
      refreshStopData(dependencies),
    ]);

    expect(a).toEqual(b);
    expect(downloads).toEqual([`${published.file}.part`]);
  });

  it('starts a fresh run once the previous one has settled', async () => {
    const failing = deps({ ok: false });
    await expect(refreshStopData(failing.dependencies)).rejects.toThrow();

    // A refresh that failed must not poison every later attempt with its own
    // rejected promise — the next launch, or the next Check now, has to be able
    // to try again.
    expect(await refreshStopData(deps().dependencies)).toEqual({
      state: 'installed',
      builtAt: published.builtAt,
    });
  });
});

describe('sweepStaleGenerations', () => {
  const older = `gtfs-v${SCHEMA_VERSION}-20260801T120000Z.db`;

  it('deletes the generation the pointer has moved off', async () => {
    const { dependencies, files, contents } = deps();
    contents.set(older, 'last week');

    await refreshStopData(dependencies);
    await sweepStaleGenerations(files);

    expect(contents.has(older)).toBe(false);
    expect(contents.has(published.file)).toBe(true);
  });

  /**
   * The floor is the fallback for a device whose every download has failed.
   * Sweeping it would take the last working database out from under it.
   */
  it('never deletes the bundled floor', async () => {
    const { files, contents } = deps();
    contents.set(older, 'last week');

    await sweepStaleGenerations(files);

    expect(contents.get('gtfs.db')).toBe('the floor');
    expect(contents.has(older)).toBe(false);
  });

  it('is silent when the directory cannot be read', async () => {
    const { files } = deps();
    const broken: DatabaseFiles = {
      ...files,
      list() {
        throw new Error('no such directory');
      },
    };

    await expect(sweepStaleGenerations(broken)).resolves.toBeUndefined();
  });
});
