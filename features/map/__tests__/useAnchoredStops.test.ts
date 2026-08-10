import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useAnchoredStops, FALLBACK_ANCHOR } from '../useAnchoredStops';
import type { LocationState } from '../../stops/useLocation';
import type { StopWithDistance } from '../../../data/gtfs/types';
import { metersBetween, type Coords } from '../../../lib/distance';

const mockQueries = {
  nearby: jest.fn(async (_center: { lat: number; lon: number }): Promise<StopWithDistance[]> => []),
  searchByName: jest.fn(async () => []),
  searchByCode: jest.fn(async () => null),
  routesForStops: jest.fn(async () => new Map()),
  stopsByIds: jest.fn(async () => []),
  feedEndDate: jest.fn(async () => null),
};

jest.mock('../../../data/gtfs/db', () => ({
  useStopQueries: () => mockQueries,
  NEARBY_RADIUS_METERS: 1500,
}));

/**
 * `useLocation` is one-shot and permission-gated by design — nothing is
 * requested until `request()` is called. This double keeps that contract, and
 * lets a test decide what granting produces.
 */
const mockRequest = jest.fn(async (): Promise<Coords | null> => null);

const mockLocation: LocationState & { granted: Coords | null } = {
  status: 'idle',
  coords: null,
  granted: null,
  request: mockRequest,
  requestIfAllowed: mockRequest,
};

jest.mock('../../stops/useLocation', () => ({
  useLocation: () => mockLocation,
}));

const stop = (id: string, meters: number): StopWithDistance => ({
  stop_id: id,
  stop_code: id,
  stop_name: `STOP ${id}`,
  lat: 21.3,
  lon: -157.85,
  meters,
});

const WAIKIKI = { lat: 21.2793, lon: -157.8294 };

describe('useAnchoredStops', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueries.nearby.mockResolvedValue([]);
    mockRequest.mockResolvedValue(null);
    mockLocation.status = 'idle';
    mockLocation.coords = null;
  });

  it('falls back to Honolulu when there is no location', async () => {
    const { result } = await renderHook(() => useAnchoredStops());

    expect(result.current.anchor).toEqual(FALLBACK_ANCHOR);
    expect(result.current.source).toBe('fallback');
  });

  it('uses the location once it is known', async () => {
    mockLocation.status = 'granted';
    mockLocation.coords = WAIKIKI;

    const { result } = await renderHook(() => useAnchoredStops());

    expect(result.current.anchor).toEqual(WAIKIKI);
    expect(result.current.source).toBe('location');
  });

  it('queries once for the initial anchor', async () => {
    await renderHook(() => useAnchoredStops());

    await waitFor(() => {
      expect(mockQueries.nearby).toHaveBeenCalledTimes(1);
    });
    expect(mockQueries.nearby).toHaveBeenCalledWith(FALLBACK_ANCHOR);
  });

  it('queries again, once, when the anchor moves', async () => {
    const { result } = await renderHook(() => useAnchoredStops());
    await waitFor(() => {
      expect(mockQueries.nearby).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      result.current.setAnchor(WAIKIKI);
    });

    await waitFor(() => {
      expect(mockQueries.nearby).toHaveBeenCalledTimes(2);
    });
    expect(mockQueries.nearby).toHaveBeenLastCalledWith(WAIKIKI);
  });

  it('does not query again when nothing but a re-render happens', async () => {
    // The viewport version of this hook would refetch on every drag settle.
    // There is no pan or zoom input to fire here, so the proof is that
    // re-rendering on its own changes nothing.
    const { result, rerender } = await renderHook(() => useAnchoredStops());
    await waitFor(() => {
      expect(mockQueries.nearby).toHaveBeenCalledTimes(1);
    });

    await rerender({});
    await rerender({});

    expect(mockQueries.nearby).toHaveBeenCalledTimes(1);
    expect(result.current.anchor).toEqual(FALLBACK_ANCHOR);
  });

  it('reports an empty result as empty, not as a failure', async () => {
    mockQueries.nearby.mockResolvedValue([]);

    const { result } = await renderHook(() => useAnchoredStops());

    await waitFor(() => {
      expect(result.current.status).toBe('empty');
    });
    expect(result.current.stops).toEqual([]);
  });

  it('reports a failed query as failed, not as empty', async () => {
    mockQueries.nearby.mockRejectedValue(new Error('disk'));

    const { result } = await renderHook(() => useAnchoredStops());

    await waitFor(() => {
      expect(result.current.status).toBe('failed');
    });
  });

  it('keeps the stops it already had when a later query fails', async () => {
    mockQueries.nearby.mockResolvedValue([stop('5', 120)]);
    const { result } = await renderHook(() => useAnchoredStops());
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    mockQueries.nearby.mockRejectedValue(new Error('disk'));
    await act(async () => {
      result.current.setAnchor(WAIKIKI);
    });

    await waitFor(() => {
      expect(result.current.status).toBe('failed');
    });
    // Blanking the list would blank the map with it, and a failed query is not
    // a reason to throw away a working view.
    expect(result.current.stops).toHaveLength(1);
  });

  it('hands back the stops the query returned', async () => {
    mockQueries.nearby.mockResolvedValue([stop('5', 120), stop('6', 340)]);

    const { result } = await renderHook(() => useAnchoredStops());

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(result.current.stops.map((s) => s.stop_id)).toEqual(['5', '6']);
  });

  it('a tapped anchor outlives a location fix arriving later', async () => {
    const { result } = await renderHook(() => useAnchoredStops());

    await act(async () => {
      result.current.setAnchor(WAIKIKI);
    });

    // The location resolves after the tap. The map must stay where it was put.
    mockLocation.status = 'granted';
    mockLocation.coords = { lat: 21.4, lon: -157.9 };
    await act(async () => {});

    expect(result.current.anchor).toEqual(WAIKIKI);
    expect(result.current.source).toBe('chosen');
  });

  it('recenter gives the anchor back to the location', async () => {
    mockLocation.status = 'granted';
    mockLocation.coords = WAIKIKI;
    const { result } = await renderHook(() => useAnchoredStops());

    await act(async () => {
      result.current.setAnchor({ lat: 21.4, lon: -157.9 });
    });
    expect(result.current.source).toBe('chosen');

    await act(async () => {
      result.current.recenter();
    });

    expect(result.current.anchor).toEqual(WAIKIKI);
    expect(result.current.source).toBe('location');
  });

  it('recenter asks for permission when it has never been asked for', async () => {
    const { result } = await renderHook(() => useAnchoredStops());

    await act(async () => {
      result.current.recenter();
    });

    expect(mockLocation.request).toHaveBeenCalledTimes(1);
  });

  it('takes a fresh fix on every recenter', async () => {
    // Not "asks only if it has to". The hook used to skip the request when it
    // already held a position, so recentring after a bus ride put the rider
    // back where they boarded — on a transit app, the one moment ⌖ exists for.
    mockLocation.status = 'granted';
    mockLocation.coords = WAIKIKI;
    const { result } = await renderHook(() => useAnchoredStops());

    await act(async () => {
      await result.current.recenter();
    });
    await act(async () => {
      await result.current.recenter();
    });

    expect(mockLocation.request).toHaveBeenCalledTimes(2);
  });

  it('hands the fresh fix back to its caller', async () => {
    mockRequest.mockResolvedValue(WAIKIKI);
    const { result } = await renderHook(() => useAnchoredStops());

    let fix: unknown;
    await act(async () => {
      fix = await result.current.recenter();
    });

    expect(fix).toEqual(WAIKIKI);
  });

  it('still yields a usable anchor when location was denied', async () => {
    mockLocation.status = 'denied';
    mockLocation.coords = null;

    const { result } = await renderHook(() => useAnchoredStops());

    expect(result.current.anchor).toEqual(FALLBACK_ANCHOR);
    expect(result.current.source).toBe('fallback');
    expect(result.current.locationStatus).toBe('denied');
    await waitFor(() => {
      expect(mockQueries.nearby).toHaveBeenCalledWith(FALLBACK_ANCHOR);
    });
  });

  it('frames a camera around the anchor that contains the query radius', async () => {
    const { result } = await renderHook(() => useAnchoredStops());
    const { region } = result.current;

    expect(region.latitude).toBe(FALLBACK_ANCHOR.lat);
    const northEdge = {
      lat: FALLBACK_ANCHOR.lat + region.latitudeDelta / 2,
      lon: FALLBACK_ANCHOR.lon,
    };
    expect(metersBetween(FALLBACK_ANCHOR, northEdge)).toBeGreaterThan(1500);
    // Walking scale, not the whole island.
    expect(metersBetween(FALLBACK_ANCHOR, northEdge)).toBeLessThan(2000);
  });

  it('moves the camera with the anchor', async () => {
    const { result } = await renderHook(() => useAnchoredStops());

    await act(async () => {
      result.current.setAnchor(WAIKIKI);
    });

    expect(result.current.region.latitude).toBe(WAIKIKI.lat);
    expect(result.current.region.longitude).toBe(WAIKIKI.lon);
  });
});
