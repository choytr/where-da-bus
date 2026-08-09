import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../../lib/theme';

/**
 * The map's persistent search bar: a control that *looks* like a field and
 * behaves like a button, opening the fullscreen search over the map.
 *
 * Not a real `TextInput`. A text field over a map fights the sheet's gestures
 * through the keyboard — the reason search became its own tab in Increment 6 —
 * and the keyboard would cover the map it is meant to be searching. The field
 * a rider actually types into lives in `SearchOverlay`, where nothing is
 * underneath it to fight with.
 *
 * **It reads a plain placeholder and never names the anchor.** *"Near you"*,
 * *"2500 Campus Rd"*, *"Dropped pin"* were offered and rejected on 2026-08-09:
 * they cost a reverse-geocode per long-press anchor and a set of invented
 * labels, for a line nobody asked for.
 *
 * It positions itself, because its height and the room the controls below it
 * have to leave are the same fact — see `SEARCH_BAR_ALLOWANCE`.
 */

export const SEARCH_PLACEHOLDER = 'Search stops, routes, addresses';

const SEARCH_BAR_HEIGHT = 44;

/** The bar's height plus the gap under it, which is what ⌖ and the *Search
 *  this area* pill have to clear. Provisional until a device round. */
export const SEARCH_BAR_ALLOWANCE = SEARCH_BAR_HEIGHT + 12;

export type SearchBarProps = {
  /** Where the bar's own top edge goes, below the safe area. */
  top: number;
  onPress: () => void;
};

export function SearchBar({ top, onPress }: SearchBarProps) {
  const { palette } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={SEARCH_PLACEHOLDER}
      onPress={onPress}
      style={[
        styles.bar,
        { top, backgroundColor: palette.background, borderColor: palette.border },
      ]}
    >
      <Text style={[styles.glyph, { color: palette.muted }]}>⌕</Text>
      <Text style={[styles.text, { color: palette.muted }]}>{SEARCH_PLACEHOLDER}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: SEARCH_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    opacity: 0.95,
  },
  glyph: { fontSize: 17 },
  text: { fontSize: 16 },
});
