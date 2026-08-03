import { useCallback, useState } from 'react';
import * as Location from 'expo-location';
import type { Coords } from '../../lib/distance';

export type LocationStatus = 'idle' | 'loading' | 'granted' | 'denied' | 'error';

export type LocationState = {
  status: LocationStatus;
  coords: Coords | null;
  /**
   * Takes a fresh fix and hands it back, or null if there was not one to take.
   *
   * Returning it as well as storing it is what lets a caller act on *this*
   * fix — moving a camera onto it — without watching state and guessing which
   * change was theirs.
   */
  request: () => Promise<Coords | null>;
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

  const request = useCallback(async (): Promise<Coords | null> => {
    setStatus('loading');

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setStatus('denied');
        setCoords(null);
        return null;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const fix = { lat: position.coords.latitude, lon: position.coords.longitude };
      setCoords(fix);
      setStatus('granted');
      return fix;
    } catch {
      setStatus('error');
      setCoords(null);
      return null;
    }
  }, []);

  return { status, coords, request };
}
