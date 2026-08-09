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
 * leading it, and it is **outside the scroll, pinned under it** — so the legend
 * is on screen from the first frame and stays there. A scroll footer was tried
 * first and traded away real prominence; a header put legal text above the
 * content. This is neither.
 *
 * The map's sheet does not render one at its collapsed detent, where it shows
 * no Data and therefore owes no legend. See `StopSheet`.
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
