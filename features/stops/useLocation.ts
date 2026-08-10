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
  /**
   * A fix **only if permission has already been given**, and silence otherwise.
   *
   * The difference from `request` is the whole point: this calls
   * `getForegroundPermissionsAsync`, which never shows the system dialog, so a
   * screen can show a distance when one is free to know and simply not show one
   * otherwise. The arrival board opened from a deep link is exactly that case —
   * it is not a screen that should be asking anyone for their location.
   */
  requestIfAllowed: () => Promise<Coords | null>;
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

  /** The half both entry points share, once permission is settled. */
  const fixNow = useCallback(async (): Promise<Coords | null> => {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const fix = { lat: position.coords.latitude, lon: position.coords.longitude };
    setCoords(fix);
    setStatus('granted');
    return fix;
  }, []);

  const request = useCallback(async (): Promise<Coords | null> => {
    setStatus('loading');

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setStatus('denied');
        setCoords(null);
        return null;
      }

      return await fixNow();
    } catch {
      setStatus('error');
      setCoords(null);
      return null;
    }
  }, [fixNow]);

  const requestIfAllowed = useCallback(async (): Promise<Coords | null> => {
    try {
      // `getForegroundPermissionsAsync`, never `request…`: this one must not be
      // able to put a dialog in front of anyone.
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') return null;
      return await fixNow();
    } catch {
      // Not `setStatus('error')`: nobody asked for this, so there is nothing to
      // report having failed.
      return null;
    }
  }, [fixNow]);

  return { status, coords, request, requestIfAllowed };
}
