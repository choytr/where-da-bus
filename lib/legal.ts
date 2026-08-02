/**
 * The two pieces of text the data provider's terms require, kept in a module
 * of their own so neither can be edited away by accident and so that reaching
 * for them costs nothing.
 *
 * They lived on `HomeScreen` until the arrival board needed them too, which
 * meant importing a screen — and with it `AsyncStorage`, `expo-location` and
 * the whole GTFS query layer — to render one line of small print. A legal
 * obligation that every screen showing this data has to satisfy should not be
 * reachable only through one screen that happens to have declared it first.
 *
 * The attribution wording is **verbatim** from the Terms of Use page of
 * `docs/api/Web_Services_API.pdf`, including the missing full stop after
 * "Inc". Do not tidy it. The disclaimer's exact wording is still pending
 * verification against the real user agreement.
 *
 * The terms permit the marks `OTS` and `HEA` only alongside an asterisked
 * trademark legend, so this project keeps those marks — and `TheBus` — out of
 * UI copy entirely. Introducing any of them makes that legend mandatory.
 */
export const ATTRIBUTION =
  'Route and arrival data provided by permission of Oahu Transit Services, Inc';

export const DISCLAIMER =
  'This is an unofficial app. Not affiliated with or endorsed by Oahu Transit Services, Inc.';
