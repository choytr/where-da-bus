import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { useTheme } from '../../lib/theme';

/**
 * The tab icons.
 *
 * **Glyphs, not an icon set, and that is a dependency decision.** The tab bar
 * passed no `tabBarIcon` at all until Increment 9, which is why iOS drew
 * placeholder triangles. The plan called for `@expo/vector-icons` on the
 * grounds that it is already installed — it is in the lockfile, but npm nests
 * it at `node_modules/expo/node_modules/@expo/vector-icons`, so it is **not
 * resolvable from this file**: `require.resolve` fails from the project root,
 * and Metro resolves from the importing file the same way. Reaching it means
 * `npx expo install @expo/vector-icons`, which is a new direct dependency, and
 * `CLAUDE.md` is explicit that adding one here is an architectural decision
 * rather than a routine install.
 *
 * Text costs nothing, tints with `color` for free, and is the language the rest
 * of this app already speaks — ⌖ recenters the map, ✕ leaves route mode, ⌕ is
 * the search bar, ★ is a favorite. If Truman wants drawn icons, that is one
 * install and one edit here.
 */
const ICONS = { index: '◎', stops: '≡', settings: '⚙' } as const;

function tabIcon(name: keyof typeof ICONS) {
  return function TabIcon({ color, size }: { color: string; size: number }) {
    // `lineHeight` matched to `fontSize`: without it the glyph sits high in the
    // tab bar, because a glyph's own line box is taller than the character.
    return <Text style={{ color, fontSize: size, lineHeight: size }}>{ICONS[name]}</Text>;
  };
}

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
      <Tabs.Screen name="index" options={{ title: 'Map', tabBarIcon: tabIcon('index') }} />
      <Tabs.Screen name="stops" options={{ title: 'Stops', tabBarIcon: tabIcon('stops') }} />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: tabIcon('settings') }}
      />
    </Tabs>
  );
}
