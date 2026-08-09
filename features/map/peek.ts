/**
 * The one band of content the resting map sheet shows.
 *
 * It lives alone in this file because **both** of the sheet's modes have to be
 * exactly this tall at their top, and they are different components:
 * `StopSheet` draws the *Nearby Stops* heading, `StopCard` draws the back
 * control, the stop's name and its star. If those two numbers ever disagree,
 * the resting sheet changes height when a rider selects a stop, which reads as
 * the sheet twitching.
 *
 * Neither can own it — `StopSheet` renders `StopCard`, so a constant exported
 * from there and imported back would be a cycle, and a cycle whose victim is a
 * `StyleSheet.create` evaluated at module scope with `undefined` for a height.
 *
 * **This is a reversal, and Truman's own.** Headings were his opening proposal
 * for Increment 7, he withdrew them during the grilling, and the spec recorded
 * them as dropped. Then a handle-only peek shipped and his verdict was
 * "horrendous". One band is the settled middle: enough to say what the sheet is
 * without being a view in its own right. Do not re-litigate it in either
 * direction without him.
 */
export const PEEK_BAND = 44;

/**
 * One more row's worth of content below the band, so the resting sheet shows
 * the nearest stop rather than only naming itself.
 *
 * Sized off a full `StopRow`: 12 pt of padding either side of a 16 pt name, a
 * 13 pt meta line 2 pt under it, and a route chip 8 pt under that. The card
 * mode spends the same height on `BoardHeader`'s name, code and age, which fit
 * it almost exactly — so both modes still come out the same height without
 * either being padded to match the other.
 *
 * A row without route chips is shorter and leaves a little air. That is the
 * right way round: the peek never clips a row it has started drawing.
 */
export const PEEK_ROW = 92;
