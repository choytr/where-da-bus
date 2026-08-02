import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { SettingsScreen } from '../SettingsScreen';
import { ThemeProvider, type ThemePreference, type ThemeStorage } from '../../../lib/theme';
import { ATTRIBUTION, DISCLAIMER } from '../../../lib/legal';

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

function show() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider storage={storage}>
        <SettingsScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

describe('SettingsScreen', () => {
  beforeEach(() => {
    feedEnd = null;
    saved = [];
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
});
