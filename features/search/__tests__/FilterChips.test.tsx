import { fireEvent, render, screen } from '@testing-library/react-native';
import { FilterChips } from '../FilterChips';
import { TestTheme } from '../../../lib/testing/theme';
import type { SearchFilter } from '../useSearch';

const show = (
  filters: readonly SearchFilter[],
  selected: SearchFilter,
  onSelect = jest.fn(),
) =>
  render(
    <TestTheme>
      <FilterChips filters={filters} selected={selected} onSelect={onSelect} />
    </TestTheme>,
  );

describe('FilterChips', () => {
  it('offers only the filters it is given', async () => {
    // The two hosts differ: the map geocodes, the Stops tab does not, and a
    // chip that cannot work is worse than no chip at all.
    await show(['stops', 'routes'], 'stops');

    screen.getByLabelText('Search by stops');
    screen.getByLabelText('Search by routes');
    expect(screen.queryByLabelText('Search by address')).toBeNull();
  });

  it('says which one is selected', async () => {
    await show(['address', 'stops', 'routes'], 'address');

    expect(screen.getByLabelText('Search by address').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByLabelText('Search by stops').props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  it('reports the filter that was tapped', async () => {
    const onSelect = jest.fn();
    await show(['address', 'stops', 'routes'], 'address', onSelect);

    await fireEvent.press(screen.getByLabelText('Search by routes'));

    expect(onSelect).toHaveBeenCalledWith('routes');
  });
});
