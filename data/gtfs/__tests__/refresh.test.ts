import {
  MANIFEST_URL,
  checkForUpdate,
  downloadDatabase,
  installUpdate,
  parseManifest,
  staleGenerations,
  type FetchManifest,
  type Manifest,
} from '../refresh';
import type { DatabaseFacts, DatabaseFiles } from '../files';
import { SCHEMA_VERSION } from '../sql';

const published = {
  schemaVersion: SCHEMA_VERSION,
  builtAt: '2026-08-10T12:00:00Z',
  file: `gtfs-v${SCHEMA_VERSION}-20260810T120000Z.db`,
  bytes: 1224704,
  sha256: 'abc123',
  sourceSha256: 'def456',
  feedEndDate: '20260822',
};

function serving(body: unknown, status = 200): FetchManifest {
  return async (url) => {
    expect(url).toBe(MANIFEST_URL);
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
}

/**
 * An in-memory stand-in for the database directory. Records every call so the
 * tests can assert on what was *not* touched, which is the whole safety claim
 * of this module.
 */
const wholeFeed: DatabaseFacts = {
  schemaVersion: SCHEMA_VERSION,
  counts: { stops: 3830, routes: 118, stopRoutes: 8629 },
};

function fakeFiles(options: { downloads?: string; facts?: DatabaseFacts | Error } = {}) {
  const contents = new Map<string, string>([['gtfs.db', 'the floor']]);
  const removed: string[] = [];

  const files: DatabaseFiles = {
    async inspect() {
      const facts = options.facts ?? wholeFeed;
      if (facts instanceof Error) throw facts;
      return facts;
    },
    async download(_url, name) {
      contents.set(name, options.downloads ?? 'fresh bytes');
    },
    async sha256(name) {
      const body = contents.get(name);
      // Real hashes are of bytes; here the "hash" is the content, so a test can
      // say "this download arrives corrupted" by naming what it contains.
      return body === undefined ? 'missing' : `sha(${body})`;
    },
    rename(from, to) {
      const body = contents.get(from);
      if (body === undefined) throw new Error(`rename of missing file ${from}`);
      contents.delete(from);
      contents.set(to, body);
    },
    remove(name) {
      removed.push(name);
      contents.delete(name);
    },
    list() {
      return [...contents.keys()];
    },
  };

  return { files, contents, removed };
}

describe('checkForUpdate', () => {
  it('reports no update when builtAt matches', async () => {
    const found = await checkForUpdate(serving(published), published.builtAt);
    expect(found).toBeNull();
  });

  it('reports an update when newer', async () => {
    const found = await checkForUpdate(serving(published), '2026-08-03T12:00:00Z');
    expect(found?.file).toBe(published.file);
    expect(found?.feedEndDate).toBe('20260822');
  });

  it('reports an update when there is nothing installed yet', async () => {
    const found = await checkForUpdate(serving(published), null);
    expect(found?.builtAt).toBe(published.builtAt);
  });

  /**
   * The published build going *backwards* is a rollback, not an update. Without
   * this the app would re-download the older build on every launch, notice it
   * was older on the next one, and never settle.
   */
  it('reports no update when the published build is older than the installed one', async () => {
    const found = await checkForUpdate(serving(published), '2026-09-01T12:00:00Z');
    expect(found).toBeNull();
  });

  it('ignores a manifest for another schema version', async () => {
    const foreign = { ...published, schemaVersion: SCHEMA_VERSION + 1 };
    expect(await checkForUpdate(serving(foreign), null)).toBeNull();
  });

  /**
   * "Up to date" and "could not check" are different facts, and Settings shows
   * them differently — the same rule the arrival board follows for "no buses
   * coming" versus "couldn't reach TheBus". A failure that came back as null
   * would render as the reassuring one.
   */
  it('throws rather than returning null when the manifest cannot be read', async () => {
    await expect(checkForUpdate(serving(published, 404), null)).rejects.toThrow(/HTTP 404/);
    await expect(checkForUpdate(serving({ nonsense: true }), null)).rejects.toThrow(
      /could not be read/,
    );
  });
});

describe('parseManifest', () => {
  it('accepts what the Action publishes', () => {
    expect(parseManifest(published)).toEqual({
      schemaVersion: SCHEMA_VERSION,
      builtAt: published.builtAt,
      file: published.file,
      bytes: published.bytes,
      sha256: published.sha256,
      feedEndDate: published.feedEndDate,
    });
  });

  it('rejects anything missing a field it cannot do without', () => {
    for (const key of ['schemaVersion', 'builtAt', 'file', 'bytes', 'sha256']) {
      const { [key]: _dropped, ...rest } = published;
      expect(parseManifest(rest)).toBeNull();
    }
  });

  it('tolerates a feed that never said when it expires', () => {
    expect(parseManifest({ ...published, feedEndDate: null })?.feedEndDate).toBeNull();
  });

  /**
   * A manifest whose timestamp cannot be parsed can never compare as older, so
   * it would re-download on every launch for the life of the install.
   */
  it('rejects a builtAt the device cannot read as a date', () => {
    expect(parseManifest({ ...published, builtAt: 'last Tuesday' })).toBeNull();
  });

  /** The name becomes a filename and a `databaseName`; this is where a path is refused. */
  it('rejects a file name that is really a path', () => {
    expect(parseManifest({ ...published, file: '../../escape.db' })).toBeNull();
    expect(parseManifest({ ...published, file: 'nested/thing.db' })).toBeNull();
  });

  it('rejects values that are not objects at all', () => {
    expect(parseManifest(null)).toBeNull();
    expect(parseManifest('a string')).toBeNull();
    expect(parseManifest([published])).toBeNull();
  });
});

describe('downloadDatabase', () => {
  const manifest: Manifest = {
    schemaVersion: SCHEMA_VERSION,
    builtAt: published.builtAt,
    file: published.file,
    bytes: published.bytes,
    sha256: 'sha(fresh bytes)',
    feedEndDate: '20260822',
  };

  it('lands the download under its generation name once the hash matches', async () => {
    const { files, contents } = fakeFiles();

    expect(await downloadDatabase(manifest, files)).toBe(manifest.file);
    expect(contents.get(manifest.file)).toBe('fresh bytes');
    expect(contents.has(`${manifest.file}.part`)).toBe(false);
  });

  it('discards a download whose hash does not match', async () => {
    const { files, contents, removed } = fakeFiles({ downloads: 'truncated' });

    await expect(downloadDatabase(manifest, files)).rejects.toThrow(/did not match its checksum/);
    expect(contents.has(manifest.file)).toBe(false);
    expect(removed).toContain(`${manifest.file}.part`);
  });

  /**
   * The reason every failure in this increment is survivable. A refresh that
   * goes wrong has to leave the database the app is reading exactly as it was,
   * so the worst outcome is stale data rather than none.
   */
  it('leaves the current database untouched on failure', async () => {
    const { files, contents } = fakeFiles({ downloads: 'truncated' });

    await expect(downloadDatabase(manifest, files)).rejects.toThrow();
    expect(contents.get('gtfs.db')).toBe('the floor');
    expect([...contents.keys()]).toEqual(['gtfs.db']);
  });

  it('clears a .part left behind by an interrupted run before downloading', async () => {
    const { files, contents, removed } = fakeFiles();
    contents.set(`${manifest.file}.part`, 'half a database');

    await downloadDatabase(manifest, files);
    expect(removed).toContain(`${manifest.file}.part`);
    expect(contents.get(manifest.file)).toBe('fresh bytes');
  });
});

describe('installUpdate', () => {
  const manifest: Manifest = {
    schemaVersion: SCHEMA_VERSION,
    builtAt: published.builtAt,
    file: published.file,
    bytes: published.bytes,
    sha256: 'sha(fresh bytes)',
    feedEndDate: '20260822',
  };

  it('returns the pointer value once the file passes every check', async () => {
    const { files } = fakeFiles();
    expect(await installUpdate(manifest, files)).toEqual({
      file: manifest.file,
      builtAt: manifest.builtAt,
    });
  });

  /**
   * The case the floor exists for, and the one `sha256` structurally cannot
   * catch: the agency publishes a truncated zip, the cron dutifully builds a
   * forty-stop database, and the checksum matches perfectly.
   */
  it('refuses a database too small to be a whole feed, and deletes it', async () => {
    const { files, contents, removed } = fakeFiles({
      facts: { schemaVersion: SCHEMA_VERSION, counts: { stops: 40, routes: 3, stopRoutes: 90 } },
    });

    await expect(installUpdate(manifest, files)).rejects.toThrow(/too small to be a whole feed/);
    expect(removed).toContain(manifest.file);
    expect(contents.get('gtfs.db')).toBe('the floor');
  });

  it('refuses a database built for another schema, and deletes it', async () => {
    const { files, removed } = fakeFiles({
      facts: { ...wholeFeed, schemaVersion: SCHEMA_VERSION + 1 },
    });

    await expect(installUpdate(manifest, files)).rejects.toThrow(/schema v/);
    expect(removed).toContain(manifest.file);
  });

  /** A database that will not open at all is the same answer: delete, keep the pointer. */
  it('refuses a database that will not open, and deletes it', async () => {
    const { files, removed } = fakeFiles({ facts: new Error('file is not a database') });

    await expect(installUpdate(manifest, files)).rejects.toThrow(/not a database/);
    expect(removed).toContain(manifest.file);
  });
});

describe('staleGenerations', () => {
  const kept = `gtfs-v${SCHEMA_VERSION}-20260810T120000Z.db`;
  const older = `gtfs-v${SCHEMA_VERSION}-20260801T120000Z.db`;

  it('sweeps every generation but the one in use', () => {
    expect(staleGenerations([kept, older, 'gtfs.db'], kept)).toEqual([older]);
  });

  /** SQLite's sidecars have to go with the database they belong to, not outlive it. */
  it('takes a swept generation’s sidecars with it', () => {
    expect(staleGenerations([kept, older, `${older}-wal`, `${older}-shm`], kept)).toEqual([
      older,
      `${older}-wal`,
      `${older}-shm`,
    ]);
    expect(staleGenerations([kept, `${kept}-wal`], kept)).toEqual([]);
  });

  /**
   * The floor is the fallback. Sweeping it would take the last working database
   * out from under a device whose every download has failed.
   */
  it('never sweeps the bundled floor', () => {
    expect(staleGenerations(['gtfs.db', older], null)).toEqual([older]);
    expect(staleGenerations(['gtfs.db'], null)).toEqual([]);
  });
});
