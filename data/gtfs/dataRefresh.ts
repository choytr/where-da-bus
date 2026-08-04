import { checkForUpdate, installUpdate, staleGenerations, type FetchManifest } from './refresh';
import { databaseFiles, type DatabaseFiles } from './files';
import {
  loadCurrentDatabase,
  saveCurrentDatabase,
  saveLastChecked,
  type CurrentDatabase,
} from '../storage/database';

/**
 * The whole refresh, end to end: is there a newer build, fetch it, prove it,
 * move the pointer.
 *
 * A plain async function rather than a hook, because it has two callers with
 * nothing else in common — the launch effect in `AppShell` and **Check now** in
 * Settings — and because everything interesting about it is testable without a
 * renderer.
 *
 * Nothing here affects the running session. The pointer it moves is read once
 * at mount, so a build installed now is opened on the next launch; see
 * `AppShell`'s `useCurrentDatabaseName` for why that is a feature.
 */

export type RefreshResult =
  /** The published build is the one already installed, or there is none newer. */
  | { state: 'up-to-date' }
  /** A newer build is on disk and will be opened next launch. */
  | { state: 'installed'; builtAt: string };

export type RefreshDependencies = {
  fetch: FetchManifest;
  files: DatabaseFiles;
  now: () => Date;
};

const live: RefreshDependencies = {
  fetch: (url) => fetch(url),
  files: databaseFiles,
  now: () => new Date(),
};

/**
 * The one in-flight refresh, shared by every caller that asks while it runs.
 *
 * Launch fires a check a moment after first paint, and Settings' **Check now**
 * is reachable well inside that window. Without this, both would download to
 * the same `.part` file at the same time and one would rename a file the other
 * was still writing. Module-level rather than a context because a second
 * provider in `AppShell` would be a lot of scaffolding for a single promise —
 * the same coalescing `withCache` does for arrivals, by the same reasoning.
 */
let inFlight: Promise<RefreshResult> | null = null;

async function run(dependencies: RefreshDependencies): Promise<RefreshResult> {
  const current = await loadCurrentDatabase();

  try {
    const manifest = await checkForUpdate(dependencies.fetch, current?.builtAt ?? null);
    if (manifest === null) return { state: 'up-to-date' };

    const installed = await installUpdate(manifest, dependencies.files);
    await saveCurrentDatabase(installed);
    return { state: 'installed', builtAt: installed.builtAt };
  } finally {
    // Recorded whether it worked or not: "when did it last look" is a
    // different fact from "did it find anything", and Settings shows both. A
    // timestamp written only on success would say the app had never checked
    // after a week of failures, which is precisely backwards.
    await saveLastChecked(dependencies.now());
  }
}

export function refreshStopData(
  dependencies: RefreshDependencies = live,
): Promise<RefreshResult> {
  inFlight ??= run(dependencies).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * Deletes every generation but the one in use, at startup, when nothing holds
 * them open. This is the other half of never overwriting an open database:
 * files accumulate precisely because a refresh refuses to reuse a name.
 *
 * Best-effort and silent. A generation that will not delete costs 1.2 MB and
 * will be swept next launch; there is nothing a rider could do about it and
 * nothing worth interrupting them for.
 */
export async function sweepStaleGenerations(
  files: DatabaseFiles = databaseFiles,
  current?: CurrentDatabase | null,
): Promise<void> {
  try {
    const keep = current === undefined ? await loadCurrentDatabase() : current;
    for (const name of staleGenerations(files.list(), keep?.file ?? null)) {
      files.remove(name);
    }
  } catch {
    // Deliberately swallowed. See above.
  }
}
