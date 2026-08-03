import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StopSheet } from '../StopSheet';
import { TestTheme } from '../../../lib/testing/theme';
import type { StopWithDistance } from '../../../data/gtfs/types';
import type { ArrivalsResult } from '../../../data/thebus';

/**
 * The sheet's two modes. What is under test is only which of them is on screen
 * and how a rider gets between them — the card's own contents are
 * StopCard.test.tsx, and how the sheet slides is not testable off-device.
 */
jest.mock('@gorhom/bottom-sheet', () => ({
  __esModule: true,
  ...require('@gorhom/bottom-sheet/mock'),
}));

const mockArrivalsResult: ArrivalsResult = {
  ok: true,
  board: { stopCode: '5', serverTime: new Date('2026-08-02T22:00:00Z'), arrivals: [] },
};

jest.mock('../../../data/thebus', () => ({
  theBus: { arrivals: jest.fn(async () => mockArrivalsResult) },
}));

const stop = (id: string, name: string, meters: number): StopWithDistance => ({
  stop_id: id,
  stop_code: id,
  stop_name: name,
  lat: 21.3,
  lon: -157.85,
  meters,
});

const STOPS = [stop('5', 'LAGOON DR', 120), stop('6', 'KAPALULU PL', 340)];

const show = (selectedStop: StopWithDistance | null, onBack = jest.fn()) =>
  render(
    <TestTheme>
      <StopSheet
        stops={STOPS}
        status="ready"
        routesByStop={new Map()}
        favoriteIds={[]}
        selectedStop={selectedStop}
        onSelect={jest.fn()}
        onBack={onBack}
        onToggleFavorite={jest.fn()}
        onOpenRoute={jest.fn()}
        onDetentChange={jest.fn()}
      />
    </TestTheme>,
  );

describe('StopSheet', () => {
  it('shows the nearby list when nothing is selected', async () => {
    await show(null);

    screen.getByText('LAGOON DR');
    screen.getByText('KAPALULU PL');
    expect(screen.queryByLabelText('Back to nearby stops')).toBeNull();
  });

  it('replaces the list with the card when a stop is selected', async () => {
    await show(STOPS[0]);

    // The card, not a row that grew: the other stops are gone from the sheet.
    screen.getByLabelText('Back to nearby stops');
    screen.getByText('Stop 5');
    expect(screen.queryByText('KAPALULU PL')).toBeNull();
  });

  it('returns to the list from the card', async () => {
    const onBack = jest.fn();
    await show(STOPS[0], onBack);

    await fireEvent.press(screen.getByLabelText('Back to nearby stops'));

    await waitFor(() => {
      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });
});
