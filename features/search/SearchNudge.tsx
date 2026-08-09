import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../../lib/theme';
import type { Nudge } from './nudge';
import type { SearchFilter } from './useSearch';

/**
 * The one line that makes a wrong filter survivable, and the tap that fixes it.
 *
 * It takes an already-computed `Nudge` rather than working one out, because the
 * host needs the same answer for a second decision: a nudge reading *"No stops
 * match — search as an address"* already says nothing matched, so the plain
 * "No stops match that." notice must not also be on screen. One call to
 * `nudgeFor`, two uses.
 *
 * Null renders nothing, so a host can hand it the result unguarded.
 */
export type SearchNudgeProps = {
  nudge: Nudge | null;
  onSwitchFilter: (filter: SearchFilter) => void;
};

export function SearchNudge({ nudge, onSwitchFilter }: SearchNudgeProps) {
  const { palette } = useTheme();
  if (nudge === null) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={nudge.text}
      onPress={() => onSwitchFilter(nudge.to)}
      style={[styles.nudge, { borderColor: palette.border }]}
    >
      <Text style={[styles.text, { color: palette.text }]}>{nudge.text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  nudge: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: { fontSize: 14, lineHeight: 19 },
});
