// kaupet_open: om rotruten skal vise oppstartsveiviseren. Svarer null når
// oppsettet er komplett.
import { getSetupStatus, type SetupStatus } from "./setup.functions";

export type { SetupStatus };

// Bare i nettleseren: serveren cacher selv, og en midlertidig feil der skal
// ikke skjule veiviseren for godt.
let complete = false;

export async function loadSetupStatus(): Promise<SetupStatus> {
  if (complete) return null;
  const status = await getSetupStatus();
  if (!status && typeof window !== "undefined") complete = true;
  return status;
}
