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

async function extract(zipPath) {
  await execFileAsync('unzip', ['-qo', zipPath, '-d', WORK]);
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
  db.exec(`
    PRAGMA journal_mode = DELETE;
    CREATE TABLE stops (
      stop_id   TEXT PRIMARY KEY,
      stop_code TEXT,
      stop_name TEXT NOT NULL,
      lat       REAL NOT NULL,
      lon       REAL NOT NULL
    );
    CREATE TABLE routes (
      route_id   TEXT PRIMARY KEY,
      short_name TEXT NOT NULL,
      long_name  TEXT NOT NULL
    );
    CREATE TABLE stop_routes (
      stop_id  TEXT NOT NULL,
      route_id TEXT NOT NULL,
      PRIMARY KEY (stop_id, route_id)
    );
    CREATE TABLE route_stops (
      route_id     TEXT NOT NULL,
      direction_id TEXT NOT NULL,
      seq          INTEGER NOT NULL,
      stop_id      TEXT NOT NULL,
      PRIMARY KEY (route_id, direction_id, seq)
    );
    CREATE INDEX idx_stops_lat_lon ON stops(lat, lon);
    CREATE INDEX idx_stop_routes_stop ON stop_routes(stop_id);
    CREATE VIRTUAL TABLE stops_fts USING fts5(stop_name, content='stops', content_rowid='rowid');
  `);

  const insertStop = db.prepare(
    'INSERT INTO stops (stop_id, stop_code, stop_name, lat, lon) VALUES (?, ?, ?, ?, ?)',
  );
  const insertRoute = db.prepare(
    'INSERT INTO routes (route_id, short_name, long_name) VALUES (?, ?, ?)',
  );
  const insertStopRoute = db.prepare(
    'INSERT INTO stop_routes (stop_id, route_id) VALUES (?, ?)',
  );
  const insertRouteStop = db.prepare(
    'INSERT INTO route_stops (route_id, direction_id, seq, stop_id) VALUES (?, ?, ?, ?)',
  );

  db.exec('BEGIN');
  for (const s of feed.stops) {
    const lat = Number(s.stop_lat);
    const lon = Number(s.stop_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    insertStop.run(s.stop_id, s.stop_code ?? '', s.stop_name, lat, lon);
  }
  for (const r of feed.routes) {
    insertRoute.run(r.route_id, r.route_short_name ?? '', r.route_long_name ?? '');
  }
  const knownStops = new Set(feed.stops.map((s) => s.stop_id));
  const knownRoutes = new Set(feed.routes.map((r) => r.route_id));
  for (const pair of stopRoutes) {
    if (!knownStops.has(pair.stop_id) || !knownRoutes.has(pair.route_id)) continue;
    insertStopRoute.run(pair.stop_id, pair.route_id);
  }
  for (const rs of routeStops) {
    if (!knownStops.has(rs.stop_id) || !knownRoutes.has(rs.route_id)) continue;
    insertRouteStop.run(rs.route_id, rs.direction_id, rs.seq, rs.stop_id);
  }
  db.exec("INSERT INTO stops_fts(stops_fts) VALUES('rebuild')");
  db.exec('COMMIT');
  db.exec('VACUUM');

  const count = (sql) => db.prepare(sql).get().n;
  console.log('--- built ---');
  console.log('stops       ', count('SELECT COUNT(*) AS n FROM stops'));
  console.log('routes      ', count('SELECT COUNT(*) AS n FROM routes'));
  console.log('stop_routes ', count('SELECT COUNT(*) AS n FROM stop_routes'));
  console.log('route_stops ', count('SELECT COUNT(*) AS n FROM route_stops'));
  console.log('feed valid  ', feed.feedInfo[0]?.feed_start_date, '->', feed.feedInfo[0]?.feed_end_date);
  db.close();
  console.log(`wrote ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
