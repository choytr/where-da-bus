import { renderHook, act, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { useLocation } from '../useLocation';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
}));

const mockedPermission = jest.mocked(Location.requestForegroundPermissionsAsync);
const mockedPosition = jest.mocked(Location.getCurrentPositionAsync);

// Full LocationObjectCoords: the real type has no optional fields, so a
// partial coords object (as the task brief's test sketch used) does not
// satisfy it. Helper keeps each test's mock focused on lat/lon.
function fakeCoords(latitude: number, longitude: number) {
  return {
    latitude,
    longitude,
    altitude: null,
    accuracy: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  };
}

describe('useLocation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('starts idle without asking for permission', async () => {
    const { result } = await renderHook(() => useLocation());
    expect(result.current.status).toBe('idle');
    expect(result.current.coords).toBeNull();
    expect(mockedPermission).not.toHaveBeenCalled();
  });

  it('exposes coordinates once permission is granted', async () => {
    mockedPermission.mockResolvedValue({
      status: Location.PermissionStatus.GRANTED,
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });
    mockedPosition.mockResolvedValue({
      coords: fakeCoords(21.3, -157.9),
      timestamp: 0,
    });

    const { result } = await renderHook(() => useLocation());
    await act(async () => {
      await result.current.request();
    });

    await waitFor(() => expect(result.current.status).toBe('granted'));
    expect(result.current.coords).toEqual({ lat: 21.3, lon: -157.9 });
  });

  it('treats denial as a supported state, not an error', async () => {
    mockedPermission.mockResolvedValue({
      status: Location.PermissionStatus.DENIED,
      granted: false,
      canAskAgain: true,
      expires: 'never',
    });

    const { result } = await renderHook(() => useLocation());
    await act(async () => {
      await result.current.request();
    });

    expect(result.current.status).toBe('denied');
    expect(result.current.coords).toBeNull();
    expect(mockedPosition).not.toHaveBeenCalled();
  });

  it('reports a hardware failure distinctly from a denial', async () => {
    mockedPermission.mockResolvedValue({
      status: Location.PermissionStatus.GRANTED,
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });
    mockedPosition.mockRejectedValue(new Error('location unavailable'));

    const { result } = await renderHook(() => useLocation());
    await act(async () => {
      await result.current.request();
    });

    expect(result.current.status).toBe('error');
  });
});
