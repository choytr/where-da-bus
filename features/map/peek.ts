/**
 * The band at the top of the map sheet, which is what the resting peek shows.
 *
 * **Both of the sheet's modes must be exactly this tall at their top** —
 * `StopSheet` draws the *Nearby Stops* heading, `StopCard` draws its back
 * control and star — or the resting sheet changes height the moment a stop is
 * selected, and reads as a twitch.
 *
 * It lives in its own file because neither component can own it: `StopSheet`
 * renders `StopCard`, so exporting it from either and importing it into the
 * other is a cycle whose victim would be a `StyleSheet.create` running at
 * module scope with `undefined` for a height.
 */
export const PEEK_BAND = 44;

/**
 * One row's worth of content below the band, so the resting sheet shows a stop
 * rather than only naming itself.
 *
 * Sized off a full `StopRow`: 12 pt of padding either side of a 16 pt name, a
 * 13 pt meta line 2 pt under it, and a route chip 8 pt under that. The card
 * spends about the same on `BoardHeader`'s name, code and age. A row with no
 * route chips is shorter and leaves a little air, which is the right way round
 * — the peek never clips a row it has started drawing.
 */
export const PEEK_ROW = 92;
