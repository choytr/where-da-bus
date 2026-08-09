import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FILTER_LABELS } from './nudge';
import { useTheme } from '../../lib/theme';
import type { SearchFilter } from './useSearch';

/**
 * Address / Stops / Routes, one selected at a time.
 *
 * They exist because inference is impossible, not because filtering is nicer
 * than being clever — see `useSearch`. The host decides which of the three it
 * offers: the map has all three and opens on Address, the Stops tab has two and
 * opens on Stops.
 *
 * Styling is provisional until a device round.
 */
export type FilterChipsProps = {
  filters: readonly SearchFilter[];
  selected: SearchFilter;
  onSelect: (filter: SearchFilter) => void;
};

export function FilterChips({ filters, selected, onSelect }: FilterChipsProps) {
  const { palette } = useTheme();

  return (
    <View style={styles.row}>
      {filters.map((filter) => {
        const isSelected = filter === selected;
        return (
          <Pressable
            key={filter}
            accessibilityRole="button"
            accessibilityLabel={`Search by ${FILTER_LABELS[filter].toLowerCase()}`}
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(filter)}
            hitSlop={6}
            style={[
              styles.chip,
              {
                borderColor: palette.border,
                backgroundColor: isSelected ? palette.chip : 'transparent',
              },
            ]}
          >
            <Text
              style={[
                styles.text,
                { color: isSelected ? palette.text : palette.muted },
                isSelected ? styles.selectedText : null,
              ]}
            >
              {FILTER_LABELS[filter]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: { fontSize: 14 },
  selectedText: { fontWeight: '600' },
});
