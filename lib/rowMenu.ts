import { ActionSheetIOS } from 'react-native';

/**
 * The menu a long press opens on a row.
 *
 * **`ActionSheetIOS` is React Native core**, so this adds no native module and
 * the Expo Go loop survives — which is why the whole increment could be built
 * and iterated without touching CI. Any of the third-party action-sheet
 * libraries would have made every subsequent change go through the slow `.ipa`
 * path; see `CLAUDE.md` on why that is an architectural decision rather than an
 * install.
 *
 * **Long press gets no discoverability affordance, and that is a decision**
 * rather than an omission to be fixed later. Truman:
 *
 * > "Long-press affordances don't have to be communicated. To me they're a
 * > discovered affordance — people who aren't satisfied with the functionality
 * > will already be fishing around for more features, and long-press is not
 * > very uncommon in apps already."
 *
 * Do not propose coach marks, a hint row, or a chevron for this.
 *
 * A wrapper rather than a call at each site for two reasons that both matter:
 * the cancel entry has to be present and has to be the *last* index, and every
 * host would otherwise repeat the index-to-action arithmetic that is the only
 * thing here that can be silently wrong.
 */

const CANCEL = 'Cancel';

export type RowAction = {
  /** Sentence case, and a verb — these read as things to do, not as headings. */
  readonly label: string;
  readonly run: () => void;
};

/**
 * Presents `actions` and resolves once the sheet has closed, whether something
 * was chosen or not.
 *
 * An empty list opens nothing. That is what makes a row whose actions are all
 * conditional — an arrival with no reporting bus, say — degrade to a plain row
 * rather than to a sheet with only Cancel in it.
 *
 * The promise is deliberately `void` and not the chosen action: callers act
 * through `run`, so a caller that awaited a result would be a second place
 * deciding what a choice means.
 */
export function showRowMenu(actions: readonly RowAction[]): Promise<void> {
  if (actions.length === 0) return Promise.resolve();

  return new Promise((resolve) => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [...actions.map((action) => action.label), CANCEL],
        cancelButtonIndex: actions.length,
      },
      (index) => {
        // Cancel, or a dismissal, indexes past the end and finds nothing —
        // which is why this is a lookup rather than a comparison against
        // `cancelButtonIndex`.
        actions[index]?.run();
        resolve();
      },
    );
  });
}
