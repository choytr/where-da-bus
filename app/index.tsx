import { HomeScreen } from '../features/stops/HomeScreen';

/**
 * Route files in `app/` are thin on purpose: Expo Router treats every file
 * here as a URL, so screens and their tests stay under `features/` where a
 * `__tests__` directory cannot become a navigable route.
 */
export default function Index() {
  return <HomeScreen />;
}
