# Reference material

Things this project was designed against, kept so the reasoning behind a UI
decision can be checked rather than remembered.

**Nothing in this directory is covered by the repository's licence.** These are
third-party materials held for reference and comparison.

## `dabus2-screenshots.jpg`

The discontinued DaBus2 app, the thing this project replaces. Three screens:
its launch screen, its nearby-stops map, and its arrival board for stop 864
(MAILE WAY + EAST-WEST RD, on the Mānoa campus).

Source: <https://manoa.hawaii.edu/commuter/wp-content/uploads/sites/6/2022/02/daBus2-app-screenshots.min_.jpg>,
a University of Hawaiʻi at Mānoa commuter-services page. The app and its
interface are Oahu Transit Services' work, not this project's.

Truman supplied this during Increment 2 and asked for the arrival board's shape
specifically. What it settled, and what it still informs:

**Adopted in Increment 2.**

- **One chronological list, sectioned by direction.** "Buses Traveling
  Eastbound" is the section header; arrivals run in time order beneath it.
  Live sampling backed the choice independently — 79% of stops serve a single
  direction, so the sectioning costs nothing at the common case.
- **A visible distinction between a GPS estimate and a schedule guess.** DaBus2
  writes `Bus No GPS` on schedule-only rows and gives them a muted crossed-out
  signal icon, against a green bus icon and a real vehicle number
  (`Bus 527 - 3:57 PM`) for tracked ones. This project reaches the same place
  from the API side: an arrival is real-time if and only if `estimated === "1"`,
  rendered as `Scheduled · no GPS` otherwise. That the official app drew the
  same line is the strongest evidence available that the distinction matters to
  riders.
- **An explicit refresh time.** DaBus2 prints an absolute clock time
  (`Last Refresh 3:31:20 PM`); this project shows a relative age instead, since
  the §4 state model needs to say *how stale* a reading is rather than when it
  was taken.
- **Imminent arrivals are visually distinct.** Its top row is red and reads
  `Arriving` rather than a duration.

**Informs Increment 3, without being copied.**

- **DaBus2 used four tabs** — Nearby, Search, Favorites, Information. This
  project uses three, merging search and favorites into one Stops tab so the
  search surface is never a blank screen with a keyboard. The precedent
  genuinely differs; the reasoning is in
  `../superpowers/specs/2026-08-02-increment-3-map.md`.
- **Its map is full-screen with no bottom sheet.** Tapping a pin was the only
  way to learn anything about a stop. This project puts a sheet over the map so
  the stop list and the pins are two views of one set.
- **The map screenshot is itself the argument for not drawing every stop.**
  That is the Mānoa campus at close zoom and the pins already overlap into an
  unreadable mass. This project anchors the pin set to a point — roughly 25
  stops — rather than drawing everything in the viewport.
