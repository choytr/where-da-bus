import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from './theme';
import { ATTRIBUTION } from './legal';

/**
 * The provider's legend, rendered the same way everywhere it is owed.
 *
 * `legal.ts` keeps the *wording* in one place so it cannot be edited away by
 * accident. This keeps the *placement and size* in one place for the same
 * reason: five screens each rendering their own `<Text>` is five chances for
 * one of them to drift, and drift is how the obligation quietly stops being
 * met on the screen nobody re-read.
 *
 * **Where it goes, and why it moved.** The terms say: "You must present the
 * Data with the following legend, prominently displayed." That obligation
 * attaches to *presenting the Data*. It does not ask for the top of the
 * screen, it does not ask for repetition within a screen, and it does not
 * reach a screen that presents no Data at all — which is why `KeyGate` and the
 * head of Settings no longer carry it, and why Settings carries it in About
 * instead, as the app's one fixed statement of provenance.
 *
 * On the screens that *do* present the Data it closes the content rather than
 * leading it. That was first done by putting it at the foot of each list,
 * which traded away real prominence: `StopsScreen` had argued for the head on
 * the grounds that "under twenty-five rows is not prominent", and that reading
 * is fair.
 *
 * **Truman's answer was better than either, and is what ships**: outside the
 * list entirely, pinned under it. Every surface renders this as a sibling of
 * its scroll view, so the legend is on screen from the first frame and stays
 * there — more prominent than the header it replaced, without putting legal
 * text above the content.
 *
 * **The map's sheet was the exception until Increment 7, and no longer is.**
 * The objection was that a pinned strip sits at the sheet's own bottom edge,
 * which at the collapsed detent was precisely the sliver the legend had just
 * been evicted from. That stopped being true when the peek was cut back to the
 * grab handle alone: the sheet at rest now presents no Data at all, so it owes
 * no legend, and the strip is simply behind the tab bar there. At every detent
 * that *does* show stops or arrivals the legend is pinned and visible — which
 * is the more prominent placement, not the less.
 */
export function Attribution() {
  const { palette } = useTheme();

  return (
    <View style={styles.block}>
      <Text style={[styles.text, { color: palette.muted }]}>{ATTRIBUTION}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  text: { fontSize: 11, lineHeight: 15 },
});
