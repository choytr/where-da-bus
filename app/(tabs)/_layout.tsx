import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
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

/**
 * The tab icons.
 *
 * **`@expo/vector-icons`, and it is not a new native dependency.** It ships
 * with `expo` itself — it was already in the lockfile at this exact version,
 * 15.1.1, and Expo Go bundles it — but npm nested it under
 * `node_modules/expo/node_modules/`, where nothing in `app/` can resolve it.
 * `npx expo install` hoists what was already there rather than fetching
 * anything new, so the Expo Go loop is untouched. Verified with `npm ci`.
 *
 * **Glyphs were tried first and were wrong.** `◎ ≡ ⚙` shipped in the first
 * Increment 9 build; on a device the gear rendered as a full-colour emoji
 * (2026-08-10, `IMG_4668.png`) because iOS resolves ⚙ to its emoji
 * presentation, and the ring was thin and oversized beside it. Truman:
 * *"The tab icons... need... work... lol"*. Text is the right answer for a
 * one-off control like ⌖ or ✕; it is not the right answer for a tab bar,
 * where three icons have to read as one set.
 *
 * Filled when selected, outline when not, which is what iOS does everywhere.
 */
const ICONS = {
  index: 'map',
  stops: 'list',
  settings: 'settings',
} as const;

function tabIcon(name: keyof typeof ICONS) {
  return function TabIcon({
    color,
    size,
    focused,
  }: {
    color: string;
    size: number;
    focused: boolean;
  }) {
    return (
      <Ionicons name={focused ? ICONS[name] : `${ICONS[name]}-outline`} size={size} color={color} />
    );
  };
}

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
      <Tabs.Screen name="index" options={{ title: 'Map', tabBarIcon: tabIcon('index') }} />
      <Tabs.Screen name="stops" options={{ title: 'Stops', tabBarIcon: tabIcon('stops') }} />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: tabIcon('settings') }}
      />
    </Tabs>
  );
}
