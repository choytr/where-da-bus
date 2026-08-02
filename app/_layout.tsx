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
export default function RootLayout() {
  return (
    <AppShell>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
      </Stack>
    </AppShell>
  );
}
