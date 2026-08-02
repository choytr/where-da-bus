import { useEffect, useState } from 'react';
import { repeat } from '../../lib/schedule';

/**
 * A clock that re-renders on an interval.
 *
 * Countdowns and the "updated 40s ago" age both have to keep moving between
 * polls, and both are computed from `now` rather than stored — so the screen
 * needs a reason to re-render that is not a new response. Ticking here rather
 * than polling more often keeps request volume tied to how fast the *data*
 * changes instead of how fast the *display* does.
 */
export function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    setNow(new Date());
    return repeat(() => setNow(new Date()), intervalMs);
  }, [intervalMs]);

  return now;
}
