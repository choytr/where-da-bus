import { Text } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { KeyGate, REGISTRATION_URL } from '../KeyGate';
import { TheBusProvider, type ApiKeyStorage } from '../../../data/thebus';
import { TestTheme } from '../../../lib/testing/theme';

const KEY = '3f7c1e92-8a4b-4d16-9f03-c5e28b71da40';

function fakeStorage(initial: string | null = null): ApiKeyStorage & {
  stored: () => string | null;
} {
  let value = initial;
  return {
    load: async () => value,
    // Deliberately does *not* trim. data/storage/apiKey.ts trims on the way to
    // the keychain and is tested for it separately; a fake that trimmed too
    // would hide whether the gate hands over a clean key or a pasted one.
    save: async (next) => {
      value = next;
    },
    clear: async () => {
      value = null;
    },
    stored: () => value,
  };
}

const show = (storage: ApiKeyStorage) =>
  render(
    <TestTheme>
      <TheBusProvider storage={storage}>
        <KeyGate>
          <Text>the app</Text>
        </KeyGate>
      </TheBusProvider>
    </TestTheme>,
  );

describe('KeyGate', () => {
  it('shows onboarding when no key is stored', async () => {
    await show(fakeStorage());

    await screen.findByText(/API key/i);
    expect(screen.queryByText('the app')).toBeNull();
  });

  it('renders the app once a key is stored', async () => {
    await show(fakeStorage(KEY));

    await screen.findByText('the app');
  });

  it('stores a pasted key', async () => {
    const storage = fakeStorage();
    await show(storage);

    await fireEvent.changeText(await screen.findByLabelText('API key'), KEY);
    await fireEvent.press(screen.getByText('Continue'));

    await waitFor(() => expect(storage.stored()).toBe(KEY));
  });

  it('trims whitespace from a pasted key', async () => {
    // Pasting on iOS routinely carries a trailing newline, and the key goes
    // straight into a query string where an invisible character is
    // indistinguishable from a wrong key.
    const storage = fakeStorage();
    await show(storage);

    await fireEvent.changeText(await screen.findByLabelText('API key'), `  ${KEY}\n`);
    await fireEvent.press(screen.getByText('Continue'));

    await waitFor(() => expect(storage.stored()).toBe(KEY));
  });

  it('lets the app through once the key is saved', async () => {
    const storage = fakeStorage();
    await show(storage);

    await fireEvent.changeText(await screen.findByLabelText('API key'), KEY);
    await fireEvent.press(screen.getByText('Continue'));

    await screen.findByText('the app');
  });

  it('does not accept a blank key', async () => {
    const storage = fakeStorage();
    await show(storage);

    await fireEvent.changeText(await screen.findByLabelText('API key'), '   ');
    await fireEvent.press(screen.getByText('Continue'));

    // Still onboarding, and nothing written: "stored but blank" must not become
    // a state that lets the user past the gate into an app that cannot work.
    await waitFor(() => expect(storage.stored()).toBeNull());
    expect(screen.queryByText('the app')).toBeNull();
  });

  it('hides the key as it is entered', async () => {
    await show(fakeStorage());

    const field = await screen.findByLabelText('API key');
    expect(field.props.secureTextEntry).toBe(true);
  });

  it('reveals the key on request', async () => {
    // A pasted GUID is unverifiable if it is masked with no way to look. The
    // toggle is the same one Settings carries, for the same reason.
    await show(fakeStorage());

    await fireEvent.press(await screen.findByLabelText('Show key'));

    expect(screen.getByLabelText('API key').props.secureTextEntry).toBe(false);
  });

  it('hides the key again', async () => {
    await show(fakeStorage());

    await fireEvent.press(await screen.findByLabelText('Show key'));
    await fireEvent.press(screen.getByLabelText('Hide key'));

    expect(screen.getByLabelText('API key').props.secureTextEntry).toBe(true);
  });

  it('shows where to register', async () => {
    await show(fakeStorage());

    await screen.findByText(REGISTRATION_URL);
  });

  it('says where the key is kept', async () => {
    await show(fakeStorage());

    await screen.findByText(/stored on this device/i);
  });

  it('renders nothing while the stored key is still being read', async () => {
    // Not a spinner. The keychain read is fast, and a flash of onboarding for
    // someone who already has a key is worse than one blank frame.
    let release = (_key: string | null) => {};
    const storage: ApiKeyStorage = {
      load: () => new Promise((resolve) => (release = resolve)),
      save: async () => {},
      clear: async () => {},
    };

    await show(storage);

    expect(screen.queryByText('the app')).toBeNull();
    expect(screen.queryByLabelText('API key')).toBeNull();

    release(KEY);
    await screen.findByText('the app');
  });

  it('says so when the key could not be saved', async () => {
    const storage = fakeStorage();
    storage.save = async () => {
      throw new Error('keychain unavailable');
    };
    await show(storage);

    await fireEvent.changeText(await screen.findByLabelText('API key'), KEY);
    await fireEvent.press(screen.getByText('Continue'));

    await screen.findByText(/could not be saved/i);
    expect(screen.queryByText('the app')).toBeNull();
  });
});
