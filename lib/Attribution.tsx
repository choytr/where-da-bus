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
 * On the screens that *do* present the Data it now closes the content rather
 * than leading it. **This trades prominence and the trade is deliberate**, so
 * the argument against is recorded rather than lost: the previous placement
 * was argued for in `StopsScreen` as "under twenty-five rows is not
 * prominent", which is a fair reading. What settled it was the collapsed map
 * sheet, where a two-line legend plus a clipped stop name was the *entire*
 * visible content — legal text had become the product. Truman asked for less
 * of it on 2026-08-08 having seen exactly that.
 *
 * If this reading is ever judged too thin, the fix is to make this component
 * render a pinned strip rather than to scatter the text back up five screens.
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
