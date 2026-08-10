import { SCHEMA_VERSION, meetsFloor } from './sql';
import type { DatabaseFiles } from './files';

/**
 * Deciding whether a newer build of the stop data exists, and getting it onto
 * the device intact.
 *
 * Nothing here replaces anything. A download lands under its own generation
 * name beside whatever the app is currently reading, and moving onto it is
 * `data/storage/database.ts`'s job. That separation is the whole safety
 * argument: every failure in this file leaves the database in use untouched,
 * so the worst outcome of a bad refresh is stale data rather than none.
 *
 * The filesystem arrives as a parameter (`DatabaseFiles`) so that the decisions
 * — is it newer, does the hash match, what gets deleted when it does not — are
 * testable without a device.
 */

/**
 * The published artifacts live at a fixed release tag, so this URL never moves.
 * Not `latest`, which does, and not the Releases API, which is 60 requests an
 * hour unauthenticated — spent to learn what a static file already says.
 *
 * Hardcoded rather than configurable. There is one publisher, it is this
 * repository, and a setting whose only correct value is the default is a way to
 * get it wrong.
 */
const RELEASE_BASE = 'https://github.com/choytr/where-da-bus/releases/download/data';

/**
 * The manifest describing builds **this binary can read**, named for its schema.
 *
 * It used to be a single `manifest.json`, and that is a trap rather than a
 * simplification. This URL is compiled into every binary that ships, and
 * `checkForUpdate` below ignores a manifest whose `schemaVersion` is not this
 * one — so the moment a schema bump publishes a newer manifest at a shared
 * name, every install of the previous binary stops updating. Not loudly:
 * `checkForUpdate` returns null, which is also what "you are up to date" looks
 * like, so Settings would go on saying the data was current while it aged
 * indefinitely. There is no App Store here to push a correction through.
 *
 * So each schema gets its own manifest and they never collide. **`manifest.json`
 * stays v1's forever**, because binaries already on phones ask for it by that
 * exact name — but nothing here ever asks for it again, and that asymmetry is
 * the point rather than an oversight: this file only has to name the manifest
 * *this* binary can read, and schema versions only go up. Keeping the old name
 * alive is the publisher's job, and `manifestNameFor` in
 * `scripts/build-gtfs/publish.mjs` is where it is done.
 */
export const MANIFEST_URL = `${RELEASE_BASE}/manifest-v${SCHEMA_VERSION}.json`;

/**
 * What the Action publishes alongside each build.
 *
 * `feedEndDate` is carried for **display only** and must never gate a download.
 * Expiry is declared inside the feed; republication is an act by the agency;
 * the two are independent, and conflating them once already produced a design
 * that would have stopped refreshing exactly when it mattered most.
 */
export type Manifest = {
  schemaVersion: number;
  builtAt: string;
  file: string;
  bytes: number;
  sha256: string;
  feedEndDate: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

function count(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Narrows parsed JSON into a `Manifest`, or null if it is not one.
 *
 * Built field by field rather than trusted, because this is unvalidated JSON
 * from the network: `JSON.parse` returns `any`, and letting that flow into a
 * typed shape would mean the compiler stops checking exactly where the data
 * stops being ours. `builtAt` has to be a date the device can parse, since a
 * manifest whose timestamp is unreadable can never be compared and would
 * otherwise re-download on every launch forever.
 */
export function parseManifest(value: unknown): Manifest | null {
  if (!isRecord(value)) return null;

  const schemaVersion = count(value, 'schemaVersion');
  const builtAt = text(value, 'builtAt');
  const file = text(value, 'file');
  const bytes = count(value, 'bytes');
  const sha256 = text(value, 'sha256');
  const feedEndDate = text(value, 'feedEndDate');

  if (schemaVersion === null || builtAt === null || file === null) return null;
  if (bytes === null || sha256 === null) return null;
  if (Number.isNaN(Date.parse(builtAt))) return null;

  // A generation name is used as a filename and as `databaseName` for
  // expo-sqlite. A published manifest naming `../something` would be a
  // path, and this is the one place that can still say no.
  if (file.includes('/') || file.includes('\\')) return null;

  return { schemaVersion, builtAt, file, bytes, sha256, feedEndDate };
}

/**
 * The slice of `fetch` this needs. Narrower than `typeof fetch` on purpose:
 * the real thing satisfies it, and a test can hand over three fields instead of
 * standing up a whole `Response` — which is otherwise only possible with the
 * type assertion this project forbids.
 */
export type FetchManifest = (
  url: string,
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/**
 * The published build, if it is newer than the one in use and readable by this
 * binary. Null means there is nothing to do.
 *
 * Throws when the check itself failed — unreachable, an HTTP error, or a
 * manifest that will not parse. "Up to date" and "could not check" are
 * different facts and Settings shows them differently, so they must not come
 * back as the same value; this is the same rule the arrival board follows for
 * "no buses coming" versus "couldn't reach TheBus".
 */
export async function checkForUpdate(
  fetchImpl: FetchManifest,
  currentBuiltAt: string | null,
): Promise<Manifest | null> {
  const response = await fetchImpl(MANIFEST_URL);
  if (!response.ok) {
    throw new Error(`Could not read the stop-data manifest: HTTP ${response.status}`);
  }

  const manifest = parseManifest(await response.json());
  if (manifest === null) {
    throw new Error('The stop-data manifest could not be read.');
  }

  // Belt to the filename's braces. The app only ever asks for its own schema's
  // filename, so this should be unreachable — which is exactly why it is
  // checked rather than assumed, since the day it is reachable is the day a
  // publish went out under the wrong name and nothing else would notice.
  if (manifest.schemaVersion !== SCHEMA_VERSION) return null;

  if (currentBuiltAt === null) return manifest;
  return Date.parse(manifest.builtAt) > Date.parse(currentBuiltAt) ? manifest : null;
}

/**
 * Fetches the build `manifest` describes and leaves it on disk under its own
 * generation name, verified. Returns that name.
 *
 * Downloads to `<file>.part` and only renames after the hash matches, so a
 * truncated or corrupted transfer never appears under a name anything would
 * open. The rename is atomic within the directory, which is what makes a
 * generation appear whole or not at all — there is no state in which a crash
 * leaves a half-written database, because nothing is ever written over.
 *
 * The hash is integrity, not provenance: it is served from the same release as
 * the file, so anyone able to rewrite one can rewrite the other. HTTPS and
 * GitHub are the provenance here, and that is a decision rather than an
 * oversight — see the spec.
 */
export async function downloadDatabase(
  manifest: Manifest,
  files: DatabaseFiles,
): Promise<string> {
  const part = `${manifest.file}.part`;

  // A previous run killed mid-download leaves one of these behind, and
  // `downloadFileAsync` is not required to overwrite.
  files.remove(part);
  await files.download(`${RELEASE_BASE}/${manifest.file}`, part);

  const digest = await files.sha256(part);
  if (digest !== manifest.sha256) {
    files.remove(part);
    throw new Error(
      `Downloaded stop data did not match its checksum (expected ${manifest.sha256}, got ${digest}).`,
    );
  }

  files.rename(part, manifest.file);
  return manifest.file;
}

/**
 * Downloads the build `manifest` describes and proves it is worth switching to.
 * Returns the pointer value; the caller stores it.
 *
 * Three checks, and each catches something the others cannot:
 *
 * - **`sha256`** says the bytes arrived intact. It says nothing about whether
 *   the build was right.
 * - **The floor** says the build is right. Upstream publishing a truncated zip
 *   yields a forty-stop database that is perfectly valid and hashes perfectly;
 *   this is the only thing between that and a rider. It runs in the Action too,
 *   and runs again here because a bad build that was published anyway is the
 *   only case that reaches a phone.
 * - **`schemaVersion`** says this binary can read it. Unreachable by design —
 *   the filename carries the version, so the app can only ever have asked for
 *   its own — which is why it is checked rather than assumed.
 *
 * A file that fails any of them is deleted and the pointer stays where it is.
 */
export async function installUpdate(
  manifest: Manifest,
  files: DatabaseFiles,
): Promise<{ file: string; builtAt: string }> {
  const file = await downloadDatabase(manifest, files);

  try {
    const { schemaVersion, counts } = await files.inspect(file);
    if (schemaVersion !== null && schemaVersion !== SCHEMA_VERSION) {
      throw new Error(`Downloaded stop data is schema v${schemaVersion}, not v${SCHEMA_VERSION}.`);
    }
    if (!meetsFloor(counts)) {
      throw new Error(
        `Downloaded stop data is too small to be a whole feed (${JSON.stringify(counts)}).`,
      );
    }
  } catch (error) {
    files.remove(file);
    throw error;
  }

  return { file, builtAt: manifest.builtAt };
}

/** Every generation this publisher has ever produced, of any schema. */
const GENERATION_PREFIX = 'gtfs-v';

/**
 * Whether this binary can open `file` at all.
 *
 * **The filename carries the schema, and this is what that is for.** A pointer
 * is not evidence about the schema of the file it names: upgrading a sideloaded
 * binary from v1 to v2 leaves a stored pointer at a `gtfs-v1-…` generation that
 * still exists on disk, and opening it succeeds. Every query added by the newer
 * schema then fails with "no such table", on a device, with the pointer and the
 * file and the checksum all perfectly in order.
 *
 * So a generation of the wrong schema is treated as **no pointer at all**,
 * which is the bundled floor — a database this binary definitely can read —
 * and the next check downloads the right generation rather than comparing
 * timestamps with one it cannot use.
 */
export function isReadableGeneration(file: string): boolean {
  return file.startsWith(`${GENERATION_PREFIX}${SCHEMA_VERSION}-`);
}

/**
 * Every generation on disk that is not `keep`, including the `.part` files of
 * abandoned downloads.
 *
 * Prefix-matched rather than exact-matched so SQLite's sidecars (`-wal`,
 * `-shm`, `-journal`) go with the database they belong to. The bundled floor is
 * `gtfs.db` and never matches, which is the point — it is the fallback, and
 * sweeping it would take the floor out from under a device whose every
 * download has failed.
 *
 * **Every schema's generations, not just this one's.** A binary upgraded from
 * v1 to v2 can never open the v1 file it downloaded, so leaving it on disk
 * costs 1.2 MB forever to keep something nothing will read. Safe because the
 * sweep is sequenced before the refresh at launch, so there is never a
 * generation on disk that the pointer has not yet been moved onto.
 */
export function staleGenerations(names: readonly string[], keep: string | null): string[] {
  return names.filter(
    (name) => name.startsWith(GENERATION_PREFIX) && (keep === null || !name.startsWith(keep)),
  );
}
