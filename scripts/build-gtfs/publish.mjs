/**
 * The publishing half of the GTFS build, driven by .github/workflows/gtfs-data.yml.
 *
 * Two subcommands, run either side of `npm run build:gtfs`:
 *
 *   node scripts/build-gtfs/publish.mjs check
 *     Fetches the currently published manifest, downloads the upstream feed,
 *     and decides whether anything has changed. Writes `changed` and
 *     `source_sha256` to $GITHUB_OUTPUT.
 *
 *   node scripts/build-gtfs/publish.mjs package <source_sha256>
 *     Floor-checks the freshly built asset and stages `dist/` with the
 *     generation-named database and the manifest that describes it.
 *
 * Kept out of the workflow YAML because it is real logic — hashes, a floor
 * check, and a manifest — and none of that is testable or readable as a shell
 * one-liner.
 */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, copyFile, appendFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SCHEMA_VERSION, FLOOR_COUNTS, meetsFloor } from '../../data/gtfs/sql.ts';

const FEED_URL = 'https://www.thebus.org/transitdata/production/google_transit.zip';

/**
 * The fixed release tag. A *permanently stable* URL is the point — not
 * `latest`, which moves, and not the Releases API, which is 60 requests an hour
 * unauthenticated and would be spent learning what a static file already says.
 */
const RELEASE_TAG = 'data';

/**
 * The manifest a binary of a given schema reads.
 *
 * **`manifest.json` is a frozen contract.** Every binary built before schema v2
 * has that exact URL compiled into it, and `checkForUpdate` ignores a manifest
 * whose `schemaVersion` is not its own — so publishing a v2 manifest there does
 * not merely fail to help an old install, it switches that install's updates
 * off silently and for good. There is no App Store to push a correction
 * through. So the unsuffixed name keeps describing v1 forever, and every binary
 * from v2 onward asks for `manifest-v<n>.json` instead.
 *
 * `data/gtfs/refresh.ts` builds the same name from the app's own
 * `SCHEMA_VERSION`. The two agreeing is the whole handshake.
 *
 * A future v3 has to decide for itself how long v1 and v2 stay worth
 * publishing. Nothing here makes that automatic: each older generation costs a
 * real transformation, and `downgradeToV1` is the only one that exists.
 */
export const manifestNameFor = (schemaVersion) =>
  schemaVersion === 1 ? 'manifest.json' : `manifest-v${schemaVersion}.json`;

const ROOT = path.resolve(import.meta.dirname, '../..');
const WORK = path.join(ROOT, '.gtfs-cache');
const BUILT = path.join(ROOT, 'assets/db/gtfs.db');
const DIST = path.join(ROOT, 'dist');

const repo = process.env.GITHUB_REPOSITORY ?? 'choytr/where-da-bus';
/**
 * The *current* schema's manifest, not the unsuffixed one.
 *
 * `check` only reads `sourceSha256`, and every generation of a build carries
 * the same one — but the unsuffixed name belongs to whatever the oldest
 * still-published generation is, and the day that stops being republished it
 * would go stale and report every feed as changed, forever.
 */
const manifestUrl = `https://github.com/${repo}/releases/download/${RELEASE_TAG}/${manifestNameFor(SCHEMA_VERSION)}`;

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

async function emitOutput(entries) {
  const file = process.env.GITHUB_OUTPUT;
  const lines = Object.entries(entries).map(([key, value]) => `${key}=${value}`);
  for (const line of lines) console.log(line);
  if (file) await appendFile(file, `${lines.join('\n')}\n`);
}

/**
 * The manifest currently published, or null if there is none — which is both
 * the first run and the case where someone deleted the release. Any failure
 * reads as "nothing published", because the safe response to not knowing what
 * is out there is to build and publish.
 */
async function publishedManifest() {
  try {
    const response = await fetch(manifestUrl);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Downloads the feed into the same cache path `build.mjs` reads from.
 *
 * That sharing is deliberate rather than incidental: the build must run over
 * the exact bytes this hash was taken of. Downloading twice would leave a
 * window in which the agency replaces the file between the check and the build,
 * and the manifest would then claim a `sourceSha256` that produced a different
 * database — so the next run would see no change and never correct it.
 */
async function downloadFeed() {
  await mkdir(WORK, { recursive: true });
  const zipPath = path.join(WORK, 'google_transit.zip');
  const response = await fetch(FEED_URL);
  if (!response.ok) throw new Error(`Feed download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(zipPath, bytes);
  return sha256(bytes);
}

async function check() {
  const [manifest, sourceSha256] = await Promise.all([publishedManifest(), downloadFeed()]);

  // Hash, not date. Expiry (`feed_end_date`) and republication are different
  // things and were conflated once already: a feed can be replaced long before
  // it expires, and can expire with nothing to replace it. Whether the file
  // changed is a fact; a cadence would be an inference, and nobody knows the
  // cadence.
  const changed = manifest?.sourceSha256 !== sourceSha256;
  if (!changed) {
    console.log(`Upstream feed unchanged (${sourceSha256.slice(0, 12)}…). Nothing to publish.`);
  }
  await emitOutput({ changed: String(changed), source_sha256: sourceSha256 });
}

/**
 * A **genuine** v1 database, built by taking v2's tables away again.
 *
 * Not a v2 file relabelled: `installUpdate` reads `schema_version` out of the
 * downloaded file and refuses a mismatch, so a lie here would fail on the phone
 * rather than in CI, which is the worst place to find it.
 *
 * Derived from the v2 build rather than emitted separately so the two
 * generations are the same feed by construction, and so the 73 MB
 * `stop_times.txt` is parsed once.
 */
export async function downgradeToV1(sourcePath, destPath) {
  await copyFile(sourcePath, destPath);
  const db = new DatabaseSync(destPath);
  db.exec('DROP TABLE route_shapes');
  db.exec('DROP TABLE shapes');
  db.exec('UPDATE meta SET schema_version = 1');
  // Without this the file keeps the pages the dropped tables occupied, and a v1
  // install downloads 150 KB of nothing.
  db.exec('VACUUM');
  db.close();
}

/** One generation's manifest, and the bytes it describes, staged into `dist`. */
async function stageGeneration(sourcePath, dist, { schemaVersion, builtAt, stamp, sourceSha256, feedEndDate }) {
  const file = `gtfs-v${schemaVersion}-${stamp}.db`;
  const bytes = await readFile(sourcePath);
  const manifest = {
    schemaVersion,
    builtAt,
    file,
    bytes: bytes.length,
    sha256: sha256(bytes),
    sourceSha256,
    feedEndDate: feedEndDate ?? null,
  };

  await copyFile(sourcePath, path.join(dist, file));
  await writeFile(
    path.join(dist, manifestNameFor(schemaVersion)),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

/**
 * `built` and `dist` are parameters, defaulting to the repo's own paths, purely
 * so the test can drive the whole staging path into a temporary directory. A
 * test that wrote into the working tree's `dist/` would pass and then leave
 * the next `gh release upload` pointing at files from a test run.
 */
export async function pkg(sourceSha256, { built = BUILT, dist = DIST } = {}) {
  if (!sourceSha256) throw new Error('usage: publish.mjs package <source_sha256>');
  if (!existsSync(built)) throw new Error(`${built} missing — run npm run build:gtfs first`);

  const db = new DatabaseSync(built, { readOnly: true });
  const counts = db.prepare(FLOOR_COUNTS).get();
  const feedEndDate = db.prepare('SELECT feed_end_date FROM meta LIMIT 1').get().feed_end_date;
  db.close();

  // The only thing standing between a bad upstream feed and a shipped one. A
  // truncated zip builds a database that is perfectly valid and perfectly
  // hashed, so the checksum cannot catch this and nothing else looks wrong.
  //
  // Checked here, on the current schema, **before** anything is downgraded: the
  // v1 file has no `shapes` table and `FLOOR_COUNTS` counts one. The older
  // generation is a strict subset of what passed, so it inherits the check.
  if (!meetsFloor(counts)) {
    throw new Error(
      `Refusing to publish: built database fails the floor — ${JSON.stringify(counts)}. ` +
        'The upstream feed is most likely truncated.',
    );
  }

  // Colons are legal in a filename and a nuisance in every tool that handles
  // one, so the stamp is the compact ISO 8601 form. `builtAt` in the manifest
  // keeps the full timestamp, which is what the app compares. Both generations
  // share it, because they are one build.
  const builtAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const stamp = builtAt.replace(/[-:]/g, '');
  const shared = { builtAt, stamp, sourceSha256, feedEndDate };

  await mkdir(dist, { recursive: true });

  const current = await stageGeneration(built, dist, { ...shared, schemaVersion: SCHEMA_VERSION });

  const legacyPath = path.join(dist, 'gtfs-v1-source.db');
  await downgradeToV1(built, legacyPath);
  const legacy = await stageGeneration(legacyPath, dist, { ...shared, schemaVersion: 1 });
  await rm(legacyPath, { force: true });

  console.log(JSON.stringify({ current, legacy, counts }, null, 2));
  // The manifest names are emitted rather than spelled out in the workflow.
  // `manifest-v2.json` was written there as a literal, which meant the day
  // `SCHEMA_VERSION` became 3 the upload step would go looking for a file this
  // script had stopped producing. Loud rather than silent — but this is the
  // subsystem where a mistake is unrecoverable, so it should not be possible.
  await emitOutput({
    file: current.file,
    legacy_file: legacy.file,
    manifest: manifestNameFor(SCHEMA_VERSION),
    legacy_manifest: manifestNameFor(1),
  });
  return { current, legacy };
}

/**
 * The CLI runs only when this file *is* the program.
 *
 * Without the guard, importing anything from here to test it runs the argument
 * parser too — which finds no subcommand and calls `process.exit(2)`, killing
 * the test process before a single assertion. The failure reads as the whole
 * suite refusing to start rather than as an import doing something.
 */
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [command, argument] = process.argv.slice(2);
  const commands = { check, package: () => pkg(argument) };

  if (!Object.hasOwn(commands, command)) {
    console.error(`usage: publish.mjs <${Object.keys(commands).join('|')}>`);
    process.exit(2);
  }

  commands[command]().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
