import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RouteSummary, Stop } from '../../data/gtfs/types';
import { useTheme } from '../../lib/theme';
import { showRowMenu } from '../../lib/rowMenu';
import { showOnMap } from '../map/showOnMap';

export type StopRowProps = {
  stop: Stop;
  routes: RouteSummary[];
  meters: number | null;
  isFavorite: boolean;
  onToggleFavorite: (stopId: string) => void;
  /** Opens this stop's live arrivals. Optional so the row stays renderable alone. */
  onPress?: (stop: Stop) => void;
  /** Opens a route's ordered stop list. Optional for the same reason. */
  onPressRoute?: (route: RouteSummary) => void;
  /**
   * Whether the long-press menu offers *Show stop on map*.
   *
   * False on the map's own list, where the answer is already on screen. There
   * is no wider "should this row have a menu" switch: the favorite entry is
   * always worth offering, so the menu is never empty.
   */
  canShowOnMap?: boolean;
};

/**
 * Metres below 1000, kilometres to one decimal above — matches how a rider
 * reads distance on foot. `meters` itself is optional at the call site (see
 * StopRowProps); this only formats a value once one exists.
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * One repeating row in the stop list (Task 9's home screen). Distance is
 * optional because location denial is a fully supported state — the row
 * still needs to be useful with just a name, code, and served routes.
 */
export function StopRow({
  stop,
  routes,
  meters,
  isFavorite,
  onToggleFavorite,
  onPress,
  onPressRoute,
  canShowOnMap = true,
}: StopRowProps) {
  const { palette } = useTheme();

  const label = isFavorite
    ? `Remove ${stop.stop_name} from favorites`
    : `Add ${stop.stop_name} to favorites`;

  /**
   * The long press, which every list of stops gets for free by rendering this
   * row — favorites, search results, the nearby list.
   *
   * It is deliberately not a prop. The actions are the same wherever the row
   * appears, and threading two callbacks through four screens to say so would
   * be four chances to leave one out.
   */
  const openMenu = () =>
    void showRowMenu([
      ...(canShowOnMap
        ? [{ label: 'Show stop on map', run: () => showOnMap({ kind: 'stop', stopId: stop.stop_id }) }]
        : []),
      {
        label: isFavorite ? 'Remove from favorites' : 'Add to favorites',
        run: () => onToggleFavorite(stop.stop_id),
      },
    ]);

  return (
    <View style={[styles.row, { borderBottomColor: palette.border }]}>
      {/* The stop's own area opens arrivals; the star and the route chips are
          separate targets inside it, which is why this is not one big button
          wrapping the whole row. */}
      <Pressable
        accessibilityRole={onPress === undefined ? undefined : 'button'}
        accessibilityLabel={onPress === undefined ? undefined : `Arrivals at ${stop.stop_name}`}
        // **Not `disabled` when there is no `onPress`**, which it was until
        // Increment 9: a disabled `Pressable` ignores a long press too, so the
        // menu would have been dead on any host that renders this row without
        // a tap handler. The role and label above already keep VoiceOver from
        // announcing a tap that leads nowhere.
        onPress={() => onPress?.(stop)}
        onLongPress={openMenu}
        style={styles.main}
      >
        <Text style={[styles.name, { color: palette.text }]}>{stop.stop_name}</Text>

        <View style={styles.metaRow}>
          <Text style={[styles.meta, { color: palette.muted }]}>
            Stop {stop.stop_code === '' ? stop.stop_id : stop.stop_code}
          </Text>
          {meters === null ? null : (
            <Text style={[styles.meta, { color: palette.muted }]}>
              {formatDistance(meters)}
            </Text>
          )}
        </View>

        <View style={styles.routes}>
          {routes.map((route) => (
            <Pressable
              key={route.route_id}
              accessibilityRole={onPressRoute === undefined ? undefined : 'button'}
              accessibilityLabel={
                onPressRoute === undefined ? undefined : `Route ${route.short_name}`
              }
              disabled={onPressRoute === undefined}
              onPress={() => onPressRoute?.(route)}
              hitSlop={6}
              style={[styles.chip, { backgroundColor: palette.chip }]}
            >
              <Text style={[styles.chipText, { color: palette.text }]}>
                {route.short_name}
              </Text>
            </Pressable>
          ))}
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => onToggleFavorite(stop.stop_id)}
        hitSlop={12}
        style={styles.star}
      >
        <Text style={[styles.starText, { color: isFavorite ? palette.star : palette.muted }]}>
          {isFavorite ? '★' : '☆'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  main: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600' },
  metaRow: { flexDirection: 'row', gap: 12, marginTop: 2 },
  meta: { fontSize: 13, fontVariant: ['tabular-nums'] },
  routes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  chipText: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  star: { paddingLeft: 12, paddingTop: 2 },
  starText: { fontSize: 22 },
});
