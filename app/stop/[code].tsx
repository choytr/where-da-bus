import { Stack, useLocalSearchParams } from 'expo-router';
import { ArrivalsScreen } from '../../features/arrivals/ArrivalsScreen';
import { useTheBus } from '../../data/thebus';

/**
 * `/stop/596` — live arrivals for one stop.
 *
 * `useLocalSearchParams` types every value as `string | string[]`, because a
 * URL can legitimately repeat a parameter. Taking the first element rather
 * than asserting the single-string case keeps that honest and costs a line.
 */
export default function StopRoute() {
  const params = useLocalSearchParams<{ code: string | string[] }>();
  const code = Array.isArray(params.code) ? params.code[0] : params.code;
  // Null only without a key, which `KeyGate` above the router rules out. See
  // app/(tabs)/index.tsx for why the guard is here rather than in the screen.
  const { client } = useTheBus();
  if (client === null) return null;

  return (
    <>
      <Stack.Screen options={{ title: 'Arrivals' }} />
      <ArrivalsScreen stopCode={code ?? ''} client={client} />
    </>
  );
}
