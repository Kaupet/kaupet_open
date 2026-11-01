import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createIsomorphicFn: () => ({
    server: (fn: (...args: unknown[]) => unknown) =>
      Object.assign(fn, { client: (clientFn: (...args: unknown[]) => unknown) => clientFn }),
  }),
  createServerFn: () => {
    let validator: (input: unknown) => unknown = (input) => input;
    let handler: ((input: { data: unknown }) => unknown) | undefined;
    const fn = async ({ data }: { data?: unknown } = {}) => {
      if (!handler) throw new Error("server handler not configured");
      return handler({ data: validator(data) });
    };
    Object.assign(fn, {
      validator: (next: typeof validator) => {
        validator = next;
        return fn;
      },
      handler: (next: typeof handler) => {
        handler = next;
        return fn;
      },
    });
    return fn;
  },
}));

const migrations = vi.hoisted(() => ({ applyMigrations: vi.fn() }));
vi.mock("./setup-migrations.server", () => migrations);

import { checkSetupConnection, completeSetup, runSetupMigrations } from "./setup.functions";

const ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_URL",
] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const servers: Server[] = [];

afterEach(async () => {
  migrations.applyMigrations.mockReset();
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});

async function startSupabaseResponder(
  respond: (
    request: import("node:http").IncomingMessage,
    response: import("node:http").ServerResponse,
  ) => void,
) {
  const server = createServer(respond);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

function json(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function configure(url: string) {
  process.env.SUPABASE_URL = url;
  process.env.SUPABASE_PUBLISHABLE_KEY = "public-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "valid-service-key";
}

describe("oppsettsveiviseren", () => {
  it("gjør ingen nettverkskall uten servermiljø eller med klientvalgt URL", async () => {
    const requests: string[] = [];
    const url = await startSupabaseResponder((request, response) => {
      requests.push(request.url ?? "");
      json(response, 200, []);
    });
    for (const key of ENV_KEYS) delete process.env[key];

    await expect(checkSetupConnection({ data: { serviceRoleKey: "fake" } })).rejects.toThrow(
      "Konfigurer SUPABASE_URL",
    );
    await expect(
      checkSetupConnection({
        data: { serviceRoleKey: "fake", url, publishableKey: "client-key" },
      }),
    ).rejects.toThrow();
    expect(requests).toEqual([]);
  });

  it("bruker den konfigurerte lokale ressursen og avviser feil service role-nøkkel", async () => {
    const requests: Array<{ url: string; apikey: string | undefined }> = [];
    const url = await startSupabaseResponder((request, response) => {
      requests.push({
        url: request.url ?? "",
        apikey: request.headers.apikey as string | undefined,
      });
      if (request.url?.startsWith("/auth/v1/admin/users")) {
        if (request.headers.apikey !== "valid-service-key") {
          json(response, 401, { message: "invalid key" });
          return;
        }
        json(response, 200, { users: [], aud: "authenticated" });
        return;
      }
      if (request.url?.startsWith("/rest/v1/user_roles")) {
        json(response, 200, []);
        return;
      }
      json(response, 404, {});
    });
    configure(url);

    await expect(
      checkSetupConnection({ data: { serviceRoleKey: "fake-service-key" } }),
    ).rejects.toThrow("Supabase godtok ikke service role-nøkkelen");
    await expect(
      checkSetupConnection({ data: { serviceRoleKey: "valid-service-key" } }),
    ).resolves.toEqual({
      state: "klar",
    });
    expect(requests.some(({ url: path }) => path.startsWith("/auth/v1/admin/users"))).toBe(true);
    expect(requests.some(({ url: path }) => path.startsWith("/rest/v1/user_roles"))).toBe(true);
    expect(
      requests.some(
        ({ url: path, apikey }) =>
          path.startsWith("/auth/v1/admin/users") && apikey === "fake-service-key",
      ),
    ).toBe(true);
    expect(
      requests.some(
        ({ url: path, apikey }) =>
          path.startsWith("/auth/v1/admin/users") && apikey === "valid-service-key",
      ),
    ).toBe(true);
  });

  it("avbryter en oppsettsforespørsel som ikke svarer innen tidsgrensen", async () => {
    let listUsersCalls = 0;
    let stalledConnectionClosed = false;
    const url = await startSupabaseResponder((request, response) => {
      if (request.url?.startsWith("/auth/v1/admin/users")) {
        listUsersCalls += 1;
        if (listUsersCalls === 1) {
          response.on("close", () => {
            stalledConnectionClosed = true;
          });
          return;
        }
        json(response, 200, { users: [], aud: "authenticated" });
        return;
      }
      json(response, 200, []);
    });
    configure(url);

    await expect(
      checkSetupConnection({ data: { serviceRoleKey: "valid-service-key" } }),
    ).rejects.toThrow("Fikk ikke kontakt med Supabase");
    await vi.waitFor(() => expect(stalledConnectionClosed).toBe(true));
  }, 15_000);

  it("rydder en opprettet bruker hvis tildeling av admin-rollen feiler", async () => {
    const requests: string[] = [];
    const url = await startSupabaseResponder((request, response) => {
      requests.push(`${request.method} ${request.url}`);
      if (request.url?.startsWith("/auth/v1/admin/users") && request.method === "GET") {
        json(response, 200, { users: [], aud: "authenticated" });
      } else if (request.url === "/auth/v1/admin/users" && request.method === "POST") {
        json(response, 200, {
          user: { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated" },
        });
      } else if (
        request.url === "/auth/v1/admin/users/11111111-1111-4111-8111-111111111111" &&
        request.method === "DELETE"
      ) {
        json(response, 200, { id: "11111111-1111-4111-8111-111111111111" });
      } else if (request.url?.startsWith("/rest/v1/user_roles") && request.method === "GET") {
        json(response, 200, []);
      } else if (request.url?.startsWith("/rest/v1/user_roles") && request.method === "POST") {
        json(response, 500, { message: "role insert failed" });
      } else {
        json(response, 404, {});
      }
    });
    configure(url);

    await expect(
      completeSetup({
        data: {
          serviceRoleKey: "valid-service-key",
          displayName: "Testadmin",
          email: "admin@example.test",
          password: "valid-password-123",
          layout: "hvit",
        },
      }),
    ).rejects.toThrow("Kunne ikke gi brukeren admin-rollen");
    expect(requests).toContain("DELETE /auth/v1/admin/users/11111111-1111-4111-8111-111111111111");
  });

  describe("migrering fra veiviseren", () => {
    const DB_URL = "postgresql://postgres:postgres@127.0.0.1:1/postgres";

    /** Svarer som Supabase; tabellene finnes når `hasSchema()` er sann. */
    async function supabase(hasSchema: () => boolean) {
      return startSupabaseResponder((request, response) => {
        if (request.url?.startsWith("/auth/v1/admin/users")) {
          if (request.headers.apikey !== "valid-service-key") {
            json(response, 401, { message: "invalid key" });
          } else json(response, 200, { users: [], aud: "authenticated" });
        } else if (request.url?.startsWith("/rest/v1/user_roles")) {
          if (hasSchema()) json(response, 200, []);
          else json(response, 404, { code: "PGRST205", message: "not found" });
        } else json(response, 404, {});
      });
    }

    it("krever SUPABASE_DB_URL på serveren og gjør da ingen kall", async () => {
      const requests: string[] = [];
      const url = await startSupabaseResponder((request, response) => {
        requests.push(request.url ?? "");
        json(response, 200, []);
      });
      configure(url);
      await expect(
        runSetupMigrations({ data: { serviceRoleKey: "valid-service-key" } }),
      ).rejects.toThrow("Sett SUPABASE_DB_URL");
      expect(requests).toEqual([]);
      expect(migrations.applyMigrations).not.toHaveBeenCalled();
    });

    it("rører ikke databasen med feil nøkkel eller når tabellene finnes", async () => {
      configure(await supabase(() => true));
      process.env.SUPABASE_DB_URL = DB_URL;
      await expect(
        runSetupMigrations({ data: { serviceRoleKey: "fake-service-key" } }),
      ).rejects.toThrow("Supabase godtok ikke service role-nøkkelen");
      await expect(
        runSetupMigrations({ data: { serviceRoleKey: "valid-service-key" } }),
      ).rejects.toThrow("Databasen har allerede tabellene");
      expect(migrations.applyMigrations).not.toHaveBeenCalled();
    });

    it("kjører migrasjonene mot serverens database og går videre", async () => {
      let migrated = false;
      configure(await supabase(() => migrated));
      process.env.SUPABASE_DB_URL = DB_URL;
      migrations.applyMigrations.mockImplementation(async () => {
        migrated = true;
        return ["20261025000000"];
      });
      await expect(
        runSetupMigrations({ data: { serviceRoleKey: "valid-service-key" } }),
      ).resolves.toEqual({ state: "klar" });
      expect(migrations.applyMigrations).toHaveBeenCalledWith(DB_URL);
    });

    it("melder feil fra Postgres uten å gå videre", async () => {
      configure(await supabase(() => false));
      process.env.SUPABASE_DB_URL = DB_URL;
      migrations.applyMigrations.mockRejectedValue(
        new Error('extension "pg_cron" is not available'),
      );
      await expect(
        runSetupMigrations({ data: { serviceRoleKey: "valid-service-key" } }),
      ).rejects.toThrow('rullet tilbake: extension "pg_cron" is not available');
    });
  });

  // Sist: en funnet admin markerer oppsettet som ferdig for resten av prosessen.
  it("avviser oppsett når databasen allerede har en admin", async () => {
    const url = await startSupabaseResponder((request, response) => {
      if (request.url?.startsWith("/rest/v1/user_roles")) {
        json(response, 200, [{ id: "existing-admin" }]);
      } else {
        json(response, 200, { users: [], aud: "authenticated" });
      }
    });
    configure(url);

    await expect(
      checkSetupConnection({ data: { serviceRoleKey: "valid-service-key" } }),
    ).rejects.toThrow("Oppsettet er allerede fullført");
  });
});
