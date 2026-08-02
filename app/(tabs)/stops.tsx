import { StopsScreen } from '../../features/stops/StopsScreen';

/**
 * `/stops` — search, with saved favorites as the empty state. Route files in
 * `app/` stay thin on purpose: Expo Router treats every file here as a URL, so
 * screens and their tests live under `features/`, where a `__tests__`
 * directory cannot become a navigable route.
 */
export default function StopsTab() {
  return <StopsScreen />;
}
