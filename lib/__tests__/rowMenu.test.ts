import { ActionSheetIOS } from 'react-native';
import { showRowMenu } from '../rowMenu';

/**
 * `ActionSheetIOS` is React Native core, so this is a real module with a native
 * side rather than a library — under Jest it is stubbed, and what these tests
 * own is the arithmetic between an index and an action, which is the only thing
 * here that can be silently wrong.
 */
const showActionSheetWithOptions = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions');

/** Presents the sheet and immediately picks `index`, as the native side would. */
function choosing(index: number) {
  showActionSheetWithOptions.mockImplementation((_options, callback) => {
    callback(index);
  });
}

beforeEach(() => {
  showActionSheetWithOptions.mockReset();
});

describe('showRowMenu', () => {
  it('offers every action, in order, with a way out', async () => {
    choosing(2);

    await showRowMenu([
      { label: 'Show stop on map', run: () => {} },
      { label: 'Add to favorites', run: () => {} },
    ]);

    const [options] = showActionSheetWithOptions.mock.calls[0] ?? [];
    expect(options?.options).toEqual(['Show stop on map', 'Add to favorites', 'Cancel']);
    expect(options?.cancelButtonIndex).toBe(2);
  });

  it('runs the action that was chosen', async () => {
    const first = jest.fn();
    const second = jest.fn();
    choosing(1);

    await showRowMenu([
      { label: 'first', run: first },
      { label: 'second', run: second },
    ]);

    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
  });

  /** Cancel indexes past the end, which is why this is a lookup and not a test. */
  it('runs nothing when the sheet is cancelled', async () => {
    const run = jest.fn();
    choosing(1);

    await showRowMenu([{ label: 'only', run }]);

    expect(run).not.toHaveBeenCalled();
  });

  it('runs nothing when the sheet is dismissed out of range', async () => {
    const run = jest.fn();
    choosing(99);

    await showRowMenu([{ label: 'only', run }]);

    expect(run).not.toHaveBeenCalled();
  });

  /**
   * A row whose actions are all conditional — an arrival with no reporting bus,
   * for instance — degrades to a plain row rather than to a sheet with nothing
   * in it but Cancel.
   */
  it('opens nothing at all when there is nothing to offer', async () => {
    await showRowMenu([]);

    expect(showActionSheetWithOptions).not.toHaveBeenCalled();
  });

  it('resolves once the sheet has closed', async () => {
    choosing(0);

    await expect(showRowMenu([{ label: 'only', run: () => {} }])).resolves.toBeUndefined();
  });
});
