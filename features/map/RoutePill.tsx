import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../lib/theme';

/**
 * What the map is showing, said on the map.
 *
 * Route mode replaces every pin and draws a line, and until now the only thing
 * naming the route was the sheet's band — which is out of sight the moment a
 * rider raises the sheet over it, or looks at the map rather than the list.
 * Truman, on being offered it: *"That will literally be perfect."*
 *
 * **No attribution legend, and that is settled twice over.** A pill presents
 * OTS data on the map surface while the sheet's peek renders no legend either;
 * raised, and ruled on:
 *
 * > "The data on the map corresponds to the data in the bottom sheet, which
 * > already has the attribution in the routes list."
 *
 * and, on the peek specifically, *"That's honestly fine."* Do not reopen this
 * as a compliance finding — `lib/Attribution.tsx` holds the reasoning about
 * where the legend does belong.
 *
 * It carries the X as well as the name. The sheet's band has one too, and two
 * ways out is the point: the band's is unreachable exactly when the pill is the
 * only thing on screen naming the route.
 *
 * **Whether it is on screen at all is `MapScreen`'s call, not this
 * component's**, and that is a layout decision rather than a stylistic one: the
 * pill appears the moment route mode is entered, a query before the route's row
 * arrives, so that the name landing does not push ⌖ and the compass down in a
 * visible shudder. A route with no name yet reads `Route`, exactly as the
 * sheet's band does for the same moment.
 */

const LEAVE_ROUTE_LABEL = 'Stop showing this route';

const PILL_HEIGHT = 32;

/**
 * The pill's height plus the gap under it, which is what the banner and ⌖ have
 * to clear when a route is showing. The same shape as
 * `SearchBar`'s `SEARCH_BAR_ALLOWANCE`: everything at the map's top edge is
 * stacked by pushing what follows it down, so the common case stays tight.
 */
export const ROUTE_PILL_ALLOWANCE = PILL_HEIGHT + 10;

export type RoutePillProps = {
  /**
   * The number on the bus — `short_name`, never `route_id`, which lies. Null
   * while the route's row is still being read.
   */
  routeName: string | null;
  /** Where the pill's own top edge goes. */
  top: number;
  onClose: () => void;
};

export function RoutePill({ routeName, top, onClose }: RoutePillProps) {
  const { palette } = useTheme();

  return (
    <View testID="route-pill" style={[styles.row, { top }]} pointerEvents="box-none">
      <View
        style={[
          styles.pill,
          { backgroundColor: palette.background, borderColor: palette.border },
        ]}
      >
        <View style={[styles.dash, { backgroundColor: palette.route }]} />
        <Text style={[styles.text, { color: palette.text }]} numberOfLines={1}>
          {routeName === null ? 'Route' : `Route ${routeName}`}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={LEAVE_ROUTE_LABEL}
          onPress={onClose}
          hitSlop={10}
        >
          <Text style={[styles.close, { color: palette.muted }]}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Full width and `box-none`, so the pill is centered without the row itself
  // taking touches meant for the map on either side of it.
  row: { position: 'absolute', left: 12, right: 12, alignItems: 'center' },
  pill: {
    height: PILL_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: PILL_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    opacity: 0.95,
  },
  // A stub of the line's own colour, so the pill and the thing it names read as
  // one. The same reasoning that made the line red in the first place.
  dash: { width: 14, height: 3, borderRadius: 2 },
  text: { fontSize: 14, fontWeight: '600' },
  close: { fontSize: 15 },
});
