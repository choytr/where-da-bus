import { MapScreen } from '../../features/map/MapScreen';
import { useTheBus } from '../../data/thebus';

/**
 * `/` — the map.
 *
 * The client comes from the provider here rather than from a module-level
 * instance, because the AppID is the user's and can change while the app runs.
 *
 * `client` is null only when there is no key, and `KeyGate` sits above the
 * router so that cannot reach a route. The check is one line and keeps the
 * screen's prop honestly non-nullable, which is cheaper than the alternative:
 * a nullable client threaded through the sheet and into the card.
 */
export default function MapTab() {
  const { client } = useTheBus();
  if (client === null) return null;

  return <MapScreen client={client} />;
}
