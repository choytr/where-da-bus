import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { SettingsScreen } from '../SettingsScreen';
import { ThemeProvider, type ThemePreference, type ThemeStorage } from '../../../lib/theme';
import { ATTRIBUTION, DISCLAIMER } from '../../../lib/legal';
import { TheBusProvider, type ApiKeyStorage } from '../../../data/thebus';
import type { RefreshResult } from '../../../data/gtfs/dataRefresh';

const KEY = '3f7c1e92-8a4b-4d16-9f03-c5e28b71da40';
const OTHER = '9b2d4f60-1c3a-4e57-8d09-2a6f4b8c1e35';

let feedEnd: string | null = null;

const mockQueries = {
  nearby: jest.fn(async () => []),
  searchByName: jest.fn(async () => []),
  searchByCode: jest.fn(async () => null),
  routesForStops: jest.fn(async () => new Map()),
  stopsByIds: jest.fn(async () => []),
  feedEndDate: jest.fn(async () => feedEnd),
  routeById: jest.fn(async () => null),
  routeStops: jest.fn(async () => []),
};

jest.mock('../../../data/gtfs/db', () => ({
  useStopQueries: () => mockQueries,
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

/**
 * The refresh, doubled. Two reasons, and either alone would be enough: the real
 * one reaches GitHub, and importing it at all pulls in `expo-sqlite`, which
 * does not load off a device (`hooks.js` requires `expo-asset`, which npm nests
 * under `node_modules/expo/`). What this suite owns is the *reporting* — that
 * each outcome reaches the screen as something different — not the refresh.
 */
// Typed against the real `RefreshResult` union rather than inferred from the
// default, or `mockResolvedValue({ state: 'installed', builtAt })` widens to
// `{ state: string }` and the `installed` branch cannot be reached at all.
const mockRefresh = jest.fn(
  async (..._args: unknown[]): Promise<RefreshResult> => ({ state: 'up-to-date' }),
);
jest.mock('../../../data/gtfs/dataRefresh', () => ({
  refreshStopData: (...args: unknown[]) => mockRefresh(...args),
}));

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

/**
 * The real ThemeProvider rather than TestTheme, because the persistence is
 * half of what this screen is for — a preference that applies and does not
 * survive relaunch is a bug the screen itself cannot show.
 */
let saved: ThemePreference[] = [];
let storage: ThemeStorage;
let keyStorage: ApiKeyStorage & { stored: () => string | null };

function fakeKeyStorage(initial: string | null): ApiKeyStorage & {
  stored: () => string | null;
} {
  let value = initial;
  return {
    load: async () => value,
    save: async (next) => {
      value = next;
    },
    clear: async () => {
      value = null;
    },
    stored: () => value,
  };
}

function show() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider storage={storage}>
        <TheBusProvider storage={keyStorage}>
          <SettingsScreen />
        </TheBusProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

/**
 * Confirmation runs through `Alert.alert`, which is a native call Jest cannot
 * present. This captures the buttons it was given so a test can press the
 * destructive one, which is the only way to reach the clear from here.
 */
function pressAlertButton(label: string) {
  const alert = jest.mocked(Alert.alert);
  const call = alert.mock.calls.at(-1);
  if (call === undefined) throw new Error('nothing asked for confirmation');
  const [, , buttons] = call;
  const button = buttons?.find((b) => b.text === label);
  if (button === undefined) throw new Error(`no "${label}" button in the confirmation`);
  button.onPress?.();
}

describe('SettingsScreen', () => {
  beforeEach(async () => {
    feedEnd = null;
    saved = [];
    keyStorage = fakeKeyStorage(KEY);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockRefresh.mockReset();
    mockRefresh.mockResolvedValue({ state: 'up-to-date' });
    await AsyncStorage.clear();
    storage = {
      load: async () => 'automatic',
      save: async (p) => {
        saved.push(p);
      },
    };
  });

  it('carries the required attribution above everything else', async () => {
    await show();
    screen.getByText(ATTRIBUTION);
  });

  it('states it is not affiliated with the agency', async () => {
    await show();
    screen.getByText(DISCLAIMER);
  });

  it('offers all three appearance options', async () => {
    await show();
    screen.getByText('Light');
    screen.getByText('Dark');
    screen.getByText('Automatic');
  });

  it('persists the appearance it is given', async () => {
    await show();
    await fireEvent.press(screen.getByText('Dark'));

    await waitFor(() => {
      expect(saved).toEqual(['dark']);
    });
  });

  it('marks the selected appearance without relying on colour', async () => {
    await show();
    await fireEvent.press(screen.getByText('Dark'));

    await waitFor(() => {
      expect(screen.getByLabelText('Dark').props.accessibilityState.selected).toBe(true);
    });
    expect(screen.getByLabelText('Light').props.accessibilityState.selected).toBe(false);
    // The checkmark is the non-colour signal, and there must be exactly one.
    expect(screen.getAllByText('✓')).toHaveLength(1);
  });

  it('reports an expired feed as old data rather than as a fault', async () => {
    feedEnd = '20200101';
    await show();

    await waitFor(() => {
      screen.getByText(/Published for service through 1 January 2020/);
    });
    screen.getByText(/may have changed since/);
  });

  it('reports a current feed without the changed-since caveat', async () => {
    feedEnd = '21000101';
    await show();

    await waitFor(() => {
      screen.getByText('Published for service through 1 January 2100.');
    });
    expect(screen.queryByText(/may have changed since/)).toBeNull();
  });

  it('does not render an unknown feed date as current', async () => {
    feedEnd = null;
    await show();

    await waitFor(() => {
      screen.getByText('This copy does not state how long it was published for.');
    });
    expect(screen.queryByText(/Published for service through/)).toBeNull();
  });

  it('says arrival times never come from the bundled copy', async () => {
    await show();
    screen.getByText(/Arrival times always come from the live service/);
  });

  describe('the stop-data refresh', () => {
    const pointAt = (builtAt: string) =>
      AsyncStorage.setItem(
        'gtfs.current.v1',
        JSON.stringify({ file: 'gtfs-v1-20260810T120000Z.db', builtAt }),
      );

    it('says the data came with the app until something has been downloaded', async () => {
      await show();
      await waitFor(() => screen.getByText(/Using the copy that came with the app/));
      screen.getByText(/Not checked for updates yet/);
    });

    it('names the published date of the build it is using', async () => {
      await pointAt('2026-08-10T12:00:00.000Z');
      await show();

      await waitFor(() => screen.getByText(/Using the copy published 10 August 2026/));
    });

    it('says when it last looked', async () => {
      await AsyncStorage.setItem('gtfs.lastChecked.v1', new Date(Date.now() - 7200_000).toISOString());
      await show();

      await waitFor(() => screen.getByText(/Last checked 2 hours ago/));
    });

    it('checks on demand and says when there was nothing newer', async () => {
      await show();

      await waitFor(() => screen.getByText('Check now'));
      await fireEvent.press(screen.getByText('Check now'));

      await waitFor(() => screen.getByText(/the latest published/));
      expect(mockRefresh).toHaveBeenCalled();
    });

    /**
     * Not "up to date". The pointer is read once at launch, so a build fetched
     * now is opened next time the app starts — and saying otherwise would make
     * the next launch's changed stop names look like a glitch.
     */
    it('says a downloaded build takes effect next launch, rather than now', async () => {
      mockRefresh.mockResolvedValue({ state: 'installed', builtAt: '2026-08-10T12:00:00.000Z' });
      await show();

      await waitFor(() => screen.getByText('Check now'));
      await fireEvent.press(screen.getByText('Check now'));

      await waitFor(() => screen.getByText(/next time you open the app/));
      expect(screen.queryByText(/the latest published/)).toBeNull();
    });

    /**
     * §4, in the one place this screen can breach it: a refresh that could not
     * reach the service must not read like one that succeeded, and it must say
     * that nothing on the device changed — which is the question someone reads
     * this to answer.
     */
    it('reports a failed check as a failure, and says the data is unchanged', async () => {
      mockRefresh.mockRejectedValue(new Error('offline'));
      await show();

      await waitFor(() => screen.getByText('Check now'));
      await fireEvent.press(screen.getByText('Check now'));

      await waitFor(() => screen.getByText(/Could not reach the stop-data service/));
      screen.getByText(/data on this device is unchanged/);
      expect(screen.queryByText(/the latest published/)).toBeNull();
    });

    it('disables the control while a check is running', async () => {
      let release = () => {};
      mockRefresh.mockImplementation(
        () => new Promise((resolve) => {
          release = () => resolve({ state: 'up-to-date' });
        }),
      );
      await show();

      await waitFor(() => screen.getByText('Check now'));
      await fireEvent.press(screen.getByText('Check now'));

      const button = await waitFor(() => screen.getByText('Checking…'));
      expect(button).toBeTruthy();

      release();
      await waitFor(() => screen.getByText('Check now'));
    });
  });

  it('masks the stored key', async () => {
    await show();

    await waitFor(() => screen.getByText(/da40$/));
    // The whole key is a credential. Enough of it shows to tell one key from
    // another; the rest does not go on a screen someone can be shoulder-surfing.
    expect(screen.queryByText(KEY)).toBeNull();
  });

  it('reveals the key on request', async () => {
    await show();

    await waitFor(() => screen.getByLabelText('Show key'));
    await fireEvent.press(screen.getByLabelText('Show key'));

    await screen.findByText(KEY);
  });

  it('hides the key again', async () => {
    await show();

    await waitFor(() => screen.getByLabelText('Show key'));
    await fireEvent.press(screen.getByLabelText('Show key'));
    await fireEvent.press(screen.getByLabelText('Hide key'));

    expect(screen.queryByText(KEY)).toBeNull();
  });

  it('masks the replacement field too', async () => {
    // The stored key was masked from the first version of this screen and the
    // field it is replaced through was not, so a key pasted in public went on
    // screen in the clear directly beneath its own bullets. Observed on a
    // device, 2026-08-08.
    await show();

    expect((await screen.findByLabelText('Replacement API key')).props.secureTextEntry).toBe(true);
  });

  it('reveals the replacement field on the same toggle as the stored key', async () => {
    await show();

    await waitFor(() => screen.getByLabelText('Show key'));
    await fireEvent.press(screen.getByLabelText('Show key'));

    expect(screen.getByLabelText('Replacement API key').props.secureTextEntry).toBe(false);
  });

  it('replaces the key with a pasted one', async () => {
    await show();

    await fireEvent.changeText(await screen.findByLabelText('Replacement API key'), OTHER);
    await fireEvent.press(screen.getByText('Save key'));

    await waitFor(() => expect(keyStorage.stored()).toBe(OTHER));
  });

  it('trims a pasted replacement', async () => {
    await show();

    await fireEvent.changeText(await screen.findByLabelText('Replacement API key'), `  ${OTHER}\n`);
    await fireEvent.press(screen.getByText('Save key'));

    await waitFor(() => expect(keyStorage.stored()).toBe(OTHER));
  });

  it('asks before clearing the key, rather than clearing it outright', async () => {
    await show();

    await fireEvent.press(await screen.findByText('Remove key'));

    expect(Alert.alert).toHaveBeenCalled();
    // Nothing gone yet. Clearing drops the user back to onboarding, so it is
    // not something a mis-tap should be able to do.
    expect(keyStorage.stored()).toBe(KEY);
  });

  it('clears the key once the confirmation is accepted', async () => {
    await show();

    await fireEvent.press(await screen.findByText('Remove key'));
    pressAlertButton('Remove');

    await waitFor(() => expect(keyStorage.stored()).toBeNull());
  });

  it('states the six-month inactivity deletion', async () => {
    await show();
    await screen.findByText(/six months/i);
  });

  it('says where to register a replacement', async () => {
    await show();
    await screen.findByText('https://api.thebus.org/NewAccount/');
  });
});
