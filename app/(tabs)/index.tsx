import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
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
 *
 * The tab bar's height is read here for the same shape of reason: it comes from
 * a React context that **throws** outside a navigator, so a `MapScreen` that
 * read it itself could not be rendered by its own tests. It is the sheet's
 * peek height and the padding under every scroll host in it — measured rather
 * than assumed, because the real value already includes the bottom safe-area
 * inset and varies by device.
 */
export default function MapTab() {
  const { client } = useTheBus();
  const tabBarHeight = useBottomTabBarHeight();
  if (client === null) return null;

  return <MapScreen client={client} tabBarHeight={tabBarHeight} />;
}
