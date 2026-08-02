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
  // declares options for a route the navigator owns. Rendering the title is
  // the only way a test can see what a user would read on the tab bar.
  Tabs.Screen = ({ options }: { options: { title: string } }) => <Text>{options.title}</Text>;
  return { Tabs };
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
});
