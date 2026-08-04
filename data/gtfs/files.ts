import { Directory, File } from 'expo-file-system';
import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { defaultDatabaseDirectory } from 'expo-sqlite';

/**
 * Every filesystem touch the refresh needs, and nothing else.
 *
 * This exists to be the *only* module in the refresh path that imports a native
 * module. `refresh.ts` holds the decisions — is there an update, does the hash
 * match, what gets deleted when it does not — and takes this as a parameter, so
 * those decisions are testable without a device and without mocking
 * `expo-file-system` module-wide. Everything below is delegation; there is no
 * logic here to get wrong, which is why it has no tests of its own.
 *
 * Names, never paths. A caller that could pass a path could put a generation
 * somewhere `expo-sqlite` will not look for it.
 */
export type DatabaseFiles = {
  /** Downloads `url` to `name`, replacing anything already there. */
  download(url: string, name: string): Promise<void>;
  /** Lowercase hex SHA-256 of `name`. */
  sha256(name: string): Promise<string>;
  /** Atomic within the directory — this is what makes a generation appear whole or not at all. */
  rename(from: string, to: string): void;
  /** Silent when the file is not there. */
  remove(name: string): void;
  /** Every filename in the database directory. */
  list(): string[];
};

/**
 * `expo-sqlite` reports its directory as a plain filesystem path
 * (`…/Documents/SQLite`, from `SQLiteModule.swift`'s `defaultDatabaseDirectory`
 * constant), while `expo-file-system` takes `file:///` URIs. Expo's argument
 * conversion appears to accept a bare path as a file URL, but that is a reading
 * of native source rather than something observed on a device — this project
 * has shipped two wrong claims made exactly that way — so the scheme is added
 * here instead, where being wrong is impossible rather than merely unlikely.
 *
 * The constant is typed `any` by expo-sqlite, so it is taken as `unknown` and
 * checked. That check is what turns it into a `string` for the compiler, rather
 * than an assertion telling the compiler to stop asking.
 */
function databaseDirectory(): Directory {
  const reported: unknown = defaultDatabaseDirectory;
  if (typeof reported !== 'string' || reported === '') {
    throw new Error('expo-sqlite did not report a database directory');
  }
  const uri = reported.startsWith('file://') ? reported : `file://${reported}`;
  const directory = new Directory(uri);
  // Present in practice — the floor is opened before any refresh runs, and
  // opening it is what creates this — but a refresh that fails because a
  // directory is missing would be a maddening thing to diagnose from a phone.
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const databaseFiles: DatabaseFiles = {
  async download(url, name) {
    const directory = databaseDirectory();
    const destination = new File(directory, name);
    if (destination.exists) destination.delete();
    await File.downloadFileAsync(url, destination);
  },

  async sha256(name) {
    // The whole file in memory. It is 1.2 MB, and streaming it would mean
    // hand-rolling an incremental SHA-256 — expo-crypto exposes a one-shot
    // digest only. Revisit if the asset ever grows an order of magnitude.
    const bytes = await new File(databaseDirectory(), name).bytes();
    return toHex(await digest(CryptoDigestAlgorithm.SHA256, bytes));
  },

  rename(from, to) {
    new File(databaseDirectory(), from).rename(to);
  },

  remove(name) {
    const file = new File(databaseDirectory(), name);
    if (file.exists) file.delete();
  },

  list() {
    return databaseDirectory()
      .list()
      .map((entry) => entry.name);
  },
};
