/**
 * Downloads Oahu's GTFS feed and emits the SQLite asset the app ships.
 *
 * Run: npm run build:gtfs
 *
 * The 73.8 MB stop_times.txt is an input to this script and never an app asset.
 * Output is roughly 1 MB.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { parseCsv, deriveStopRoutes, deriveRouteStops } from './derive.mjs';
import { emitDatabase } from './emit.mjs';

const execFileAsync = promisify(execFile);

// The widely-cited webapps.thebus.org URL is dead — that host now answers with
// an Avaya session border controller certificate. This is the live source.
const FEED_URL = 'https://www.thebus.org/transitdata/production/google_transit.zip';

const ROOT = path.resolve(import.meta.dirname, '../..');
const WORK = path.join(ROOT, '.gtfs-cache');
const OUT = path.join(ROOT, 'assets/db/gtfs.db');

async function download() {
  await mkdir(WORK, { recursive: true });
  const zipPath = path.join(WORK, 'google_transit.zip');

  if (existsSync(zipPath)) {
    console.log('Using cached feed. Delete .gtfs-cache to refetch.');
    return zipPath;
  }

  console.log(`Downloading ${FEED_URL}`);
  const response = await fetch(FEED_URL);
  if (!response.ok) {
    throw new Error(`Feed download failed: HTTP ${response.status}`);
  }
  await writeFile(zipPath, Buffer.from(await response.arrayBuffer()));
  return zipPath;
}

// Requires the `unzip` CLI on PATH. Preinstalled on macOS and most Linux
// distros (including WSL2's default Ubuntu/Debian); on bare Windows without
// WSL, install e.g. via `choco install unzip` or Git Bash's bundled copy.
async function extract(zipPath) {
  try {
    await execFileAsync('unzip', ['-qo', zipPath, '-d', WORK]);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(
        'Missing prerequisite: the `unzip` command was not found on PATH. ' +
          'Install it (e.g. `apt install unzip` on WSL/Debian, `choco install unzip` ' +
          'on Windows, preinstalled on macOS) and re-run `npm run build:gtfs`.',
      );
    }
    throw error;
  }
  const read = (name) => readFile(path.join(WORK, name), 'utf8');
  return {
    stops: parseCsv(await read('stops.txt')),
    routes: parseCsv(await read('routes.txt')),
    trips: parseCsv(await read('trips.txt')),
    stopTimes: parseCsv(await read('stop_times.txt')),
    feedInfo: parseCsv(await read('feed_info.txt')),
  };
}

async function main() {
  const zipPath = await download();
  console.log('Extracting and parsing (stop_times.txt is large, expect a pause)');
  const feed = await extract(zipPath);

  console.log(`stops=${feed.stops.length} routes=${feed.routes.length} trips=${feed.trips.length} stop_times=${feed.stopTimes.length}`);

  const stopRoutes = deriveStopRoutes(feed.stopTimes, feed.trips);
  const routeStops = deriveRouteStops(feed.stopTimes, feed.trips);
  console.log(`derived stop_routes=${stopRoutes.length} route_stops=${routeStops.length}`);

  await mkdir(path.dirname(OUT), { recursive: true });
  await rm(OUT, { force: true });

  const db = new DatabaseSync(OUT);
  const counts = emitDatabase(db, {
    stops: feed.stops,
    routes: feed.routes,
    stopRoutes,
    routeStops,
    feedStartDate: feed.feedInfo[0]?.feed_start_date,
    feedEndDate: feed.feedInfo[0]?.feed_end_date,
  });
  db.close();

  console.log('--- built ---');
  console.log('stops       ', counts.stops, `(dropped ${counts.duplicateStopsDropped} duplicate _merge rows)`);
  console.log('routes      ', counts.routes);
  console.log('stop_routes ', counts.stopRoutes);
  console.log('route_stops ', counts.routeStops);
  console.log('feed valid  ', feed.feedInfo[0]?.feed_start_date, '->', feed.feedInfo[0]?.feed_end_date);
  console.log(`wrote ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
