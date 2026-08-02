import { Stack, useLocalSearchParams } from 'expo-router';
import { RouteScreen } from '../../features/routes/RouteScreen';

/** `/route/1L` — every stop the route serves, in order. */
export default function RouteRoute() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  return (
    <>
      <Stack.Screen options={{ title: 'Route' }} />
      <RouteScreen routeId={id ?? ''} />
    </>
  );
}
