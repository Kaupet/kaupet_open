import { createServer } from "node:net";

/** Portene `run-e2e` flytter med samme forskyvning, slik de står i config.toml. */
export const SUPABASE_PORTS = [54320, 54321, 54322, 54323, 54324, 54325, 54326, 54327, 54329];
export const INSPECTOR_PORT = 8083;
export const APP_PORT = 18080;

const canBind = (port, host) =>
  new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen({ port, host }, () => server.close(() => resolve(true)));
  });

// macOS lar 0.0.0.0 og 127.0.0.1 binde samme port samtidig, så Docker-porter
// (0.0.0.0) og lokale dev-servere (127.0.0.1) oppdages hver av sin sjekk.
export async function isPortFree(port) {
  return (await canBind(port, "0.0.0.0")) && (await canBind(port, "127.0.0.1"));
}

export async function pickFreePortOffset({ random = Math.random, isFree = isPortFree } = {}) {
  const ports = [...SUPABASE_PORTS, INSPECTOR_PORT, APP_PORT];
  for (let tries = 0; tries < 50; tries++) {
    const offset = 1000 + Math.floor(random() * 7000);
    const free = await Promise.all(ports.map((port) => isFree(port + offset)));
    if (free.every(Boolean)) return offset;
  }
  throw new Error("Fant ingen ledige porter for isolert lokal Supabase.");
}

/**
 * Hvert forsøk får nye porter: sjekken over kan ikke se en stack som startes
 * rett etterpå, og samme porter ville feilet på samme måte i alle forsøk.
 * Returnerer forskyvningen som virket, eller null.
 */
export async function startOnFreePorts({
  start,
  cleanup,
  attempts = 3,
  pickOffset = pickFreePortOffset,
}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const offset = await pickOffset();
    if (start(offset)) return offset;
    cleanup(attempt, attempts);
  }
  return null;
}
