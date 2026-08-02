import { Tabs } from 'expo-router';
import { useTheme } from '../../lib/theme';

/**
 * The three tabs. `(tabs)` is a route *group* — the parentheses keep it out of
 * the URL, so the stops tab is `/stops` rather than `/(tabs)/stops`, and the
 * map is `/`.
 *
 * `app/stop/[code]` and `app/route/[id]` deliberately stay at the root rather
 * than living inside a tab. They are pushed onto the root stack, over the tab
 * bar, and are defined once instead of once per tab that can reach them —
 * every tab can.
 *
 * `title` is set on every screen because iOS labels a back button with the
 * *previous* screen's title, and an unset title is the filename. That is
 * exactly how every back button in Increment 2 came to read "Index".
 */
export default function TabsLayout() {
  const { palette } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.text,
        tabBarInactiveTintColor: palette.muted,
        tabBarStyle: {
          backgroundColor: palette.background,
          borderTopColor: palette.border,
        },
        sceneStyle: { backgroundColor: palette.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Map' }} />
      <Tabs.Screen name="stops" options={{ title: 'Stops' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
