/**
 * Timers that hand back a canceller instead of a handle.
 *
 * The project loads `@types/node` globally so `node:sqlite` resolves in the
 * GTFS build script. A side effect is that `@types/node`'s ambient
 * `setTimeout`/`setInterval` overloads win over React Native's, so the handle
 * is typed `NodeJS.Timeout` while React Native actually returns a plain
 * numeric id. Anything reached through that wrong type — `.unref()`,
 * `.refresh()` — typechecks cleanly and then throws on a device.
 * `ReturnType<typeof setInterval>` is no escape; it resolves to the same
 * wrong type for the same reason.
 *
 * CLAUDE.md's rule is to annotate such handles as `number`. That cannot be
 * written without a type assertion, which this project also forbids — so the
 * handle is kept inside a closure instead and never given a type at all. The
 * caller receives a `() => void`, on which there is no wrong method to call.
 * The rule is satisfied by making the mistake unexpressible rather than by
 * naming the type correctly.
 */

/** Runs `fn` once after `ms`. Returns a canceller; calling it twice is safe. */
export function schedule(fn: () => void, ms: number): () => void {
  const handle = setTimeout(fn, ms);
  return () => clearTimeout(handle);
}

/** Runs `fn` every `ms`. Returns a canceller; calling it twice is safe. */
export function repeat(fn: () => void, ms: number): () => void {
  const handle = setInterval(fn, ms);
  return () => clearInterval(handle);
}
