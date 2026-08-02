import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { MapScreen } from '../MapScreen';
import { TestTheme } from '../../../lib/testing/theme';
import { ATTRIBUTION } from '../../../lib/legal';

/**
 * `initialWindowMetrics` is null off-device and a provider seeded with null
 * renders nothing at all, so real device metrics stand in — the same reason
 * HomeScreen.test.tsx does it. See CLAUDE.md.
 */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <TestTheme>
        <MapScreen />
      </TestTheme>
    </SafeAreaProvider>,
  );
}

describe('MapScreen', () => {
  it('carries the required attribution', async () => {
    await renderScreen();
    screen.getByText(ATTRIBUTION);
  });

  it('says what the screen will hold rather than rendering blank', async () => {
    await renderScreen();
    screen.getByText('Nearby stops will appear here.');
  });
});
