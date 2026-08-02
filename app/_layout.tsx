import { useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { AppShell } from '../AppShell';

/**
 * The root route. Everything structural lives in `AppShell` — the safe-area
 * provider, the database gate, and the screens for an open that is still
 * running or has failed — so this file is only the navigator that sits inside
 * it, and so that shell stays testable without a router.
 *
 * `index` keeps `headerShown: false` because `HomeScreen` draws its own
 * header inside a `SafeAreaView` and has been verified on a device that way.
 * The screens added in Increment 2 take the stack's native header instead,
 * which is what gives them a back affordance and the swipe gesture.
 */

/**
 * The native header does not follow `userInterfaceStyle: automatic` on its
 * own — left alone it renders light in dark mode, against screens that are
 * already dark. React Navigation has a theme system for this, but reaching
 * for it means importing `@react-navigation/native` directly, which is a
 * transitive dependency of expo-router rather than one this project declares.
 * Naming the three colours here keeps the dependency surface honest and
 * matches the palettes the screens already define.
 */
const light = { background: '#ffffff', text: '#11181c' };
const dark = { background: '#101314', text: '#ecedee' };

export default function RootLayout() {
  const palette = useColorScheme() === 'dark' ? dark : light;

  return (
    <AppShell>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: palette.background },
          headerTintColor: palette.text,
          headerTitleStyle: { color: palette.text },
          // The stack's card, seen during the push transition. Without this it
          // flashes white on the way into a dark screen.
          contentStyle: { backgroundColor: palette.background },
          // iOS labels the back button with the *previous* screen's title.
          // Left unset that is the route name, so every back button read
          // "Index" — the filename leaking into the interface.
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false, title: 'Stops' }} />
      </Stack>
    </AppShell>
  );
}
