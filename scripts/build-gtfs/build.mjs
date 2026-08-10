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
import {
  parseCsv,
  deriveStopRoutes,
  deriveRouteStops,
  deriveRouteShapes,
  deriveShapes,
  representativeTrips,
} from './derive.mjs';
import { emitDatabase } from './emit.mjs';
import { FLOOR_COUNTS, meetsFloor } from '../../data/gtfs/sql.ts';

/**
 * How far a point may be dropped from the line that replaces it.
 *
 * Measured across all 532 variants: 5 m stores 201 KiB, 10 m stores 152 KiB and
 * 20 m stores 116 KiB. 10 m is well inside the width of the roads being drawn,
 * and the saving from 5 m is a quarter of the table.
 */
const SHAPE_TOLERANCE_METERS = 10;

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
    shapes: parseCsv(await read('shapes.txt')),
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
  // The same representatives the stop sequences came from, so a direction's
  // line and its stop list describe one journey rather than two.
  const routeShapes = deriveRouteShapes(
    feed.trips,
    representativeTrips(feed.stopTimes, feed.trips),
  );
  const shapes = deriveShapes(feed.shapes, SHAPE_TOLERANCE_METERS);
  console.log(
    `derived stop_routes=${stopRoutes.length} route_stops=${routeStops.length} ` +
      `shapes=${shapes.length} route_shapes=${routeShapes.length}`,
  );

  await mkdir(path.dirname(OUT), { recursive: true });
  await rm(OUT, { force: true });

  const db = new DatabaseSync(OUT);
  const counts = emitDatabase(db, {
    stops: feed.stops,
    routes: feed.routes,
    stopRoutes,
    routeStops,
    shapes,
    routeShapes,
    feedStartDate: feed.feedInfo[0]?.feed_start_date,
    feedEndDate: feed.feedInfo[0]?.feed_end_date,
  });

  /**
   * The same floor `publish.mjs` applies before publishing, applied here too.
   *
   * `emitDatabase` defaults `shapes` and `routeShapes` to empty so the tests
   * that are about stop relationships need not supply them — which means a
   * build that stopped passing them would emit a perfectly valid database with
   * no route lines in it, and nothing about the run would look wrong. This is
   * the cheapest place to notice, and it fails at the point of the mistake
   * rather than a week later in the Action.
   */
  const floorCounts = db.prepare(FLOOR_COUNTS).get();
  db.close();
  if (!meetsFloor(floorCounts)) {
    throw new Error(
      `Built database fails the floor — ${JSON.stringify(floorCounts)}. ` +
        'Either the upstream feed is truncated or this script stopped deriving something.',
    );
  }

  console.log('--- built ---');
  // Silence when there is nothing to say, so the line that appears means
  // something. `orphaned` is the one to look at: it is rows the build threw
  // away, and it is how a feed that changes id format loses data without any
  // headline count moving. `deduplicated` is the _merge remap working.
  const relationshipNote = (orphaned, deduplicated) => {
    const notes = [];
    if (orphaned > 0) notes.push(`${orphaned} orphaned`);
    if (deduplicated > 0) notes.push(`${deduplicated} de-duplicated`);
    return notes.length === 0 ? '' : `(${notes.join(', ')})`;
  };
  console.log('stops       ', counts.stops, `(dropped ${counts.duplicateStopsDropped} duplicate _merge rows)`);
  console.log('routes      ', counts.routes);
  console.log(`stop_routes  ${counts.stopRoutes} ${relationshipNote(counts.stopRoutesOrphaned, counts.stopRoutesDeduplicated)}`.trimEnd());
  console.log(`route_stops  ${counts.routeStops} ${relationshipNote(counts.routeStopsOrphaned, 0)}`.trimEnd());
  console.log('shapes      ', counts.shapes);
  console.log(`route_shapes ${counts.routeShapes} ${relationshipNote(counts.routeShapesOrphaned, 0)}`.trimEnd());
  console.log('feed valid  ', feed.feedInfo[0]?.feed_start_date, '->', feed.feedInfo[0]?.feed_end_date);
  console.log(`wrote ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
