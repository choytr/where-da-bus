import { Text } from 'react-native';
import { act, render, renderHook, waitFor } from '@testing-library/react-native';
import { ThemeProvider, useTheme, type ThemePreference, type ThemeStorage } from '../theme';

/** The OS scheme, controlled per test. */
let mockOsScheme: 'light' | 'dark' = 'light';
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  default: () => mockOsScheme,
}));

/**
 * The provider takes its storage as a prop, so this is the whole of it — no
 * AsyncStorage, no native module, nothing to reset between files. The real
 * implementation is data/storage/preferences.ts and is tested on its own.
 */
function fakeStorage(): ThemeStorage & { stored: () => ThemePreference } {
  let value: ThemePreference = 'automatic';
  return {
    load: async () => value,
    save: async (next) => {
      value = next;
    },
    stored: () => value,
  };
}

let storage: ThemeStorage & { stored: () => ThemePreference };

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider storage={storage}>{children}</ThemeProvider>
);

describe('theme', () => {
  beforeEach(() => {
    storage = fakeStorage();
    mockOsScheme = 'light';
  });

  it('follows a light OS when the preference is automatic', async () => {
    const { result } = await renderHook(() => useTheme(), { wrapper });
    expect(result.current.preference).toBe('automatic');
    expect(result.current.scheme).toBe('light');
    expect(result.current.palette.background).toBe('#ffffff');
  });

  it('follows a dark OS when the preference is automatic', async () => {
    mockOsScheme = 'dark';
    const { result } = await renderHook(() => useTheme(), { wrapper });
    expect(result.current.scheme).toBe('dark');
    expect(result.current.palette.background).toBe('#101314');
  });

  it('ignores a light OS when the preference is dark', async () => {
    const { result } = await renderHook(() => useTheme(), { wrapper });

    await act(async () => {
      result.current.setPreference('dark');
    });

    expect(result.current.scheme).toBe('dark');
    expect(result.current.palette.background).toBe('#101314');
  });

  it('ignores a dark OS when the preference is light', async () => {
    mockOsScheme = 'dark';
    const { result } = await renderHook(() => useTheme(), { wrapper });

    await act(async () => {
      result.current.setPreference('light');
    });

    expect(result.current.scheme).toBe('light');
    expect(result.current.palette.background).toBe('#ffffff');
  });

  it('persists the preference it is given', async () => {
    const { result } = await renderHook(() => useTheme(), { wrapper });

    await act(async () => {
      result.current.setPreference('dark');
    });

    await waitFor(() => {
      expect(storage.stored()).toBe('dark');
    });
  });

  it('restores a stored preference over the OS scheme on mount', async () => {
    await storage.save('dark');

    const { result } = await renderHook(() => useTheme(), { wrapper });
    await waitFor(() => {
      expect(result.current.preference).toBe('dark');
    });
    expect(result.current.scheme).toBe('dark');
  });

  it('gives every palette key a value in both schemes', async () => {
    const { result: lightResult } = await renderHook(() => useTheme(), { wrapper });
    mockOsScheme = 'dark';
    const { result: darkResult } = await renderHook(() => useTheme(), { wrapper });

    const lightKeys = Object.keys(lightResult.current.palette).sort();
    const darkKeys = Object.keys(darkResult.current.palette).sort();

    expect(darkKeys).toEqual(lightKeys);
    expect(lightKeys.length).toBeGreaterThan(0);
    for (const value of Object.values(darkResult.current.palette)) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('throws when used outside a provider, rather than rendering unthemed', async () => {
    // The same guard shape as useSafeAreaInsets: a missing provider must be a
    // loud failure, because a silent default renders a screen that looks fine
    // in Jest and wrong on the device.
    const Bare = () => {
      useTheme();
      return <Text>unreachable</Text>;
    };
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // The rejection *is* the assertion: nothing mounts, so there is no tree to
    // query afterwards.
    await expect(render(<Bare />)).rejects.toThrow(/ThemeProvider/);

    spy.mockRestore();
  });
});
