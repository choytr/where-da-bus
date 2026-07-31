import { useCallback, useState } from 'react';
import * as Location from 'expo-location';
import type { Coords } from '../../lib/distance';

export type LocationStatus = 'idle' | 'loading' | 'granted' | 'denied' | 'error';

export type LocationState = {
  status: LocationStatus;
  coords: Coords | null;
  request: () => Promise<void>;
};

/**
 * One-shot foreground location.
 *
 * Denial is a first-class state: the caller falls back to favorites and search
 * rather than blocking. Nothing is requested until request() is called, so the
 * permission prompt is tied to a user action.
 */
export function useLocation(): LocationState {
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [coords, setCoords] = useState<Coords | null>(null);

  const request = useCallback(async () => {
    setStatus('loading');

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setStatus('denied');
        setCoords(null);
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setCoords({ lat: position.coords.latitude, lon: position.coords.longitude });
      setStatus('granted');
    } catch {
      setStatus('error');
      setCoords(null);
    }
  }, []);

  return { status, coords, request };
}
