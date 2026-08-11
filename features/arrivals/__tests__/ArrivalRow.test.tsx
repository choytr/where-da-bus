import { fireEvent, render, screen } from '@testing-library/react-native';
import { ArrivalRow } from '../ArrivalRow';
import { TestTheme } from '../../../lib/testing/theme';
import type { Arrival } from '../../../data/thebus';

/**
 * The row itself, and specifically the one thing about it that differs between
 * its two hosts: on the map an arrival can be tapped to highlight the bus drawn
 * behind the sheet, and on `/stop/[code]` there is no map to point at.
 */

const NOW = new Date('2026-08-02T22:00:00Z');

const live: Arrival = {
  id: 'a-1',
  tripId: 'trip-1',
  route: '2',
  headsign: 'WAIKIKI',
  direction: 'Westbound',
  arrivesAt: new Date('2026-08-02T22:08:00Z'),
  estimate: 'live',
  vehicle: '240',
  position: { lat: 21.3, lon: -157.85 },
  shape: 's-out',
  canceled: false,
};

const row = () => screen.getByLabelText(/Route 2 to WAIKIKI/);

describe('ArrivalRow', () => {
  it('leads with the countdown, which is the question being asked', async () => {
    await render(
      <TestTheme>
        <ArrivalRow stopId="1" arrival={live} now={NOW} />
      </TestTheme>,
    );

    expect(screen.getByText('8 min')).toBeTruthy();
  });

  it('says in words whether the time is measured or guessed', async () => {
    await render(
      <TestTheme>
        <ArrivalRow stopId="1" arrival={live} now={NOW} />
      </TestTheme>,
    );

    // The glyph and the words are one Text node, so the match is on the
    // composed string rather than on the wording alone.
    expect(screen.getByText(/Live .* Bus 240/)).toBeTruthy();
  });

  /**
   * **Every row is a button now.** It used to be plain text on the arrivals
   * screen, on the grounds that there was no map behind it to point at — but
   * since 2026-08-10 a tap there *takes* the rider to the map, so announcing a
   * button is announcing something true. Truman: *"directly tapping an arrival
   * row should show live bus on map, not just the long-press menu."*
   */
  it('is a button wherever it appears', async () => {
    await render(
      <TestTheme>
        <ArrivalRow stopId="1" arrival={live} now={NOW} />
      </TestTheme>,
    );

    expect(row().props.accessibilityRole).toBe('button');
  });

  it('is a button when the map can highlight its bus', async () => {
    await render(
      <TestTheme>
        <ArrivalRow stopId="1" arrival={live} now={NOW} onPress={jest.fn()} />
      </TestTheme>,
    );

    expect(row().props.accessibilityRole).toBe('button');
  });

  it('hands back the arrival it was tapped on', async () => {
    const onPress = jest.fn();
    await render(
      <TestTheme>
        <ArrivalRow stopId="1" arrival={live} now={NOW} onPress={onPress} />
      </TestTheme>,
    );

    await fireEvent.press(row());

    expect(onPress).toHaveBeenCalledWith(live);
  });

  it('reports its selected state to VoiceOver', async () => {
    await render(
      <TestTheme>
        <ArrivalRow stopId="1" arrival={live} now={NOW} onPress={jest.fn()} selected />
      </TestTheme>,
    );

    expect(row().props.accessibilityState.selected).toBe(true);
  });
});
