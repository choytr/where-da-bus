import { render, screen } from '@testing-library/react-native';
import TabsLayout from '../app/(tabs)/_layout';
import { TestTheme } from '../lib/testing/theme';

/**
 * A test for a route file, kept *outside* `app/`. Every file under `app/` is a
 * URL, so a `__tests__` directory there would be scanned by the router — and
 * "it has no default export so it cannot render" is not a guarantee worth
 * relying on, it is a dev-time warning waiting to happen. The root `__tests__`
 * directory already holds App.test.tsx for the same reason.
 */
jest.mock('expo-router', () => {
  const { View, Text } = require('react-native');
  const Tabs = ({ children }: { children: React.ReactNode }) => <View>{children}</View>;
  // Expo Router's <Tabs.Screen> is configuration, not a rendered view — it
  // declares options for a route the navigator owns. Rendering the title and
  // the icon is the only way a test can see what a user would read on the tab
  // bar.
  Tabs.Screen = ({
    options,
  }: {
    options: { title: string; tabBarIcon?: (p: { color: string; size: number; focused: boolean }) => React.ReactNode };
  }) => (
    <View>
      <Text>{options.title}</Text>
      {options.tabBarIcon?.({ color: '#000', size: 24, focused: false })}
    </View>
  );
  return { Tabs };
});

/**
 * The icon set resolves on a device and not under Jest, which is a packaging
 * quirk rather than anything about this screen: npm nests `expo-asset` under
 * `node_modules/expo/`, so `expo-font` — which `@expo/vector-icons` pulls in —
 * cannot be loaded from the project root. The same trap `data/gtfs/files.ts`
 * carries for `expo-sqlite`, and the same remedy: double it here. What this
 * file is about is that every tab *has* an icon and a title, which the double
 * reports faithfully.
 */
jest.mock('@expo/vector-icons/Ionicons', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>,
  };
});

describe('the tab bar', () => {
  it('labels the three tabs with copy, not filenames', async () => {
    await render(
      <TestTheme>
        <TabsLayout />
      </TestTheme>,
    );

    screen.getByText('Map');
    screen.getByText('Stops');
    screen.getByText('Settings');
    // "Index" is what an unset title renders as, and is how every back button
    // in Increment 2 came to be labelled with a filename.
    expect(screen.queryByText('Index')).toBeNull();
  });

  /**
   * The bar passed no `tabBarIcon` at all until Increment 9, and iOS drew
   * placeholder triangles for all three. An icon per tab is the whole fix.
   */
  it('gives every tab an icon', async () => {
    await render(
      <TestTheme>
        <TabsLayout />
      </TestTheme>,
    );

    screen.getByText('icon:map-outline');
    screen.getByText('icon:list-outline');
    screen.getByText('icon:settings-outline');
  });
});
