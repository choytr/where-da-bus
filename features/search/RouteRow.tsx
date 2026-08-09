import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../lib/theme';
import type { RouteSummary } from '../../data/gtfs/types';

/**
 * One route in a result list: the number on the bus, and where it goes.
 *
 * **It never shows `route_id`**, which is not a number any rider has seen.
 * `route_id: '13'` is route 14 and `route_id: '40'` is route C, so putting the
 * id on screen would hand someone the wrong bus. The id is still what a tap
 * navigates by — see `SEARCH_ROUTES` for the same split on the query side.
 *
 * A handful of routes carry no `short_name` at all in the feed (SKYLINE is
 * one), so the badge is omitted rather than rendered empty, and the name
 * carries the row on its own.
 */
export type RouteRowProps = {
  route: RouteSummary;
  onPress: (route: RouteSummary) => void;
};

export function RouteRow({ route, onPress }: RouteRowProps) {
  const { palette } = useTheme();
  const numbered = route.short_name !== '';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={numbered ? `Route ${route.short_name}` : route.long_name}
      onPress={() => onPress(route)}
      style={[styles.row, { borderBottomColor: palette.border }]}
    >
      {numbered ? (
        <View style={[styles.badge, { backgroundColor: palette.chip }]}>
          <Text style={[styles.badgeText, { color: palette.text }]}>{route.short_name}</Text>
        </View>
      ) : null}
      <Text style={[styles.name, { color: palette.text }]} numberOfLines={2}>
        {route.long_name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  badge: { minWidth: 44, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  name: { flex: 1, fontSize: 16 },
});
