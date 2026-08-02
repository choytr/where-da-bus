import { Stack } from 'expo-router';
import { AppShell } from '../AppShell';
import { useTheme } from '../lib/theme';

/**
 * The root route. Everything structural lives in `AppShell` — the safe-area
 * provider, the database gate, and the screens for an open that is still
 * running or has failed — so this file is only the navigator that sits inside
 * it, and so that shell stays testable without a router.
 *
 * The root stack holds two things: the `(tabs)` group, and the screens pushed
 * over it — `/stop/[code]` and `/route/[id]`. Those two are defined once at
 * the root rather than once inside each tab that can reach them, and they take
 * the stack's native header, which is what gives them a back affordance and
 * the swipe gesture. The tab group draws its own chrome and takes none.
 */

/**
 * The native header does not follow `userInterfaceStyle: automatic` on its
 * own — left alone it renders light in dark mode, against screens that are
 * already dark. React Navigation has a theme system for this, but reaching for
 * it means importing `@react-navigation/native` directly, which is a
 * transitive dependency of expo-router rather than one this project declares.
 * Styling the header from the app's own palette keeps the dependency surface
 * honest, and now also keeps the header honest to the *preference* rather than
 * to the OS.
 *
 * This file is inside `AppShell`, so it can read the theme — but the
 * `<Stack>` it returns has to be a child of that shell, which is why the
 * navigator lives in a second component below rather than in `RootLayout`.
 */
export default function RootLayout() {
  return (
    <AppShell>
      <ThemedStack />
    </AppShell>
  );
}

function ThemedStack() {
  const { palette } = useTheme();

  return (
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
      {/*
        The tab group owns its own chrome, so the root stack shows no header
        over it. The two pushed screens below it keep the stack's native
        header, which is what gives them a back affordance and the swipe.
      */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
