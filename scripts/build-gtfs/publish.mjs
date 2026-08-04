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
import { mkdir, writeFile, readFile, copyFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { SCHEMA_VERSION, FLOOR_COUNTS, meetsFloor } from '../../data/gtfs/sql.ts';

const FEED_URL = 'https://www.thebus.org/transitdata/production/google_transit.zip';

/**
 * The fixed release tag. A *permanently stable* URL is the point — not
 * `latest`, which moves, and not the Releases API, which is 60 requests an hour
 * unauthenticated and would be spent learning what a static file already says.
 */
const RELEASE_TAG = 'data';

const ROOT = path.resolve(import.meta.dirname, '../..');
const WORK = path.join(ROOT, '.gtfs-cache');
const BUILT = path.join(ROOT, 'assets/db/gtfs.db');
const DIST = path.join(ROOT, 'dist');

const repo = process.env.GITHUB_REPOSITORY ?? 'choytr/where-da-bus';
const manifestUrl = `https://github.com/${repo}/releases/download/${RELEASE_TAG}/manifest.json`;

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

async function pkg(sourceSha256) {
  if (!sourceSha256) throw new Error('usage: publish.mjs package <source_sha256>');
  if (!existsSync(BUILT)) throw new Error(`${BUILT} missing — run npm run build:gtfs first`);

  const db = new DatabaseSync(BUILT, { readOnly: true });
  const counts = db.prepare(FLOOR_COUNTS).get();
  const feedEndDate = db.prepare('SELECT feed_end_date FROM meta LIMIT 1').get().feed_end_date;
  db.close();

  // The only thing standing between a bad upstream feed and a shipped one. A
  // truncated zip builds a database that is perfectly valid and perfectly
  // hashed, so the checksum cannot catch this and nothing else looks wrong.
  if (!meetsFloor(counts)) {
    throw new Error(
      `Refusing to publish: built database fails the floor — ${JSON.stringify(counts)}. ` +
        'The upstream feed is most likely truncated.',
    );
  }

  // Colons are legal in a filename and a nuisance in every tool that handles
  // one, so the stamp is the compact ISO 8601 form. `builtAt` in the manifest
  // keeps the full timestamp, which is what the app compares.
  const builtAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const stamp = builtAt.replace(/[-:]/g, '');
  const file = `gtfs-v${SCHEMA_VERSION}-${stamp}.db`;

  const bytes = await readFile(BUILT);
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    builtAt,
    file,
    bytes: bytes.length,
    sha256: sha256(bytes),
    sourceSha256,
    feedEndDate: feedEndDate ?? null,
  };

  await mkdir(DIST, { recursive: true });
  await copyFile(BUILT, path.join(DIST, file));
  await writeFile(path.join(DIST, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(JSON.stringify({ ...manifest, counts }, null, 2));
  await emitOutput({ file });
}

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
