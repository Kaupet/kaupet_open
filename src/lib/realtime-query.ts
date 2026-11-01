import type { QueryClient, QueryKey } from "@tanstack/react-query";

/** Et eldre hentesvar må ikke overskrive sanntidsendringen. */
export async function applyRealtimeQueryUpdate<T>(
  client: QueryClient,
  key: QueryKey,
  update: (previous: T | undefined) => T | undefined,
  isActive: () => boolean,
) {
  if (!isActive()) return;
  await client.cancelQueries({ queryKey: key });
  if (!isActive()) return;
  if (client.getQueryData(key) === undefined) {
    // Første henting ble avbrutt: hent hele datasettet, ikke bare hendelsen.
    await client.invalidateQueries({ queryKey: key });
  } else {
    client.setQueryData<T>(key, update);
  }
}
