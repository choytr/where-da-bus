import { HomeScreen } from '../../features/stops/HomeScreen';

/**
 * `/stops` — the searchable stop list. Route files in `app/` stay thin on
 * purpose: Expo Router treats every file here as a URL, so screens and their
 * tests live under `features/`, where a `__tests__` directory cannot become a
 * navigable route.
 */
export default function StopsTab() {
  return <HomeScreen />;
}
