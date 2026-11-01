#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseOnly = process.argv.includes("--database-only");

function run(command, args, options = {}) {
  const started = performance.now();
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    // `bun run` imports the developer's .env, including SUPABASE_PROJECT_ID.
    // That variable overrides config.toml in the Supabase CLI.
    env: { ...(options.env ?? process.env), SUPABASE_PROJECT_ID: projectId },
  });
  if (!options.capture) {
    console.log(
      `[E2E] ${command} ${args.join(" ")}: ${((performance.now() - started) / 1000).toFixed(1)} s`,
    );
  }
  return result;
}

function runAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      env: options.env ?? process.env,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ status: code ?? (signal ? 1 : 0) }));
  });
}
function parseDotenv(text) {
  const values = new Map();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator);
    let value = trimmed.slice(separator + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values.set(key, value);
  }
  return values;
}

function localSupabaseStatus(workdir) {
  const result = run("bunx", ["supabase", "--workdir", workdir, "status", "-o", "env"], {
    capture: true,
  });
  return result.status === 0 ? parseDotenv(result.stdout) : null;
}

const e2eRoot = mkdtempSync(path.join(tmpdir(), "kaupet-e2e-"));
const e2eSupabaseDir = path.join(e2eRoot, "supabase");
// Never inherit linked-project metadata into the disposable local stack.
cpSync(path.join(root, "supabase"), e2eSupabaseDir, {
  recursive: true,
  filter: (source) => ![".temp", ".branches"].includes(path.basename(source)),
});
const configPath = path.join(e2eSupabaseDir, "config.toml");
const portOffset = 1000 + Math.floor(Math.random() * 7000);
const port = (original) => String(original + portOffset);
const projectId = `kaupet-e2e-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
const isolatedConfig = readFileSync(configPath, "utf8")
  .replace(/^project_id\s*=\s*"[^"]+"/m, `project_id = "${projectId}"`)
  .replaceAll("54320", port(54320))
  .replaceAll("54321", port(54321))
  .replaceAll("54322", port(54322))
  .replaceAll("54323", port(54323))
  .replaceAll("54324", port(54324))
  .replaceAll("54325", port(54325))
  .replaceAll("54326", port(54326))
  .replaceAll("54327", port(54327))
  .replaceAll("54329", port(54329))
  .replace("inspector_port = 8083", `inspector_port = ${port(8083)}`)
  .replace("[auth.email.smtp]\nenabled = true", "[auth.email.smtp]\nenabled = false");
writeFileSync(configPath, isolatedConfig);
// Lokal S3-protokollfixture. Autorisasjon og kvoter testes i appen/RLS;
// den faktiske lagringsleverandørens IAM/CORS må også prøves før utrulling.
const objects = new Map();
const storage = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  const key = decodeURIComponent(url.pathname);
  const authorized = !!request.headers.authorization || url.searchParams.has("X-Amz-Signature");
  response.setHeader("access-control-allow-origin", "*");
  if (
    (!authorized && key.startsWith("/attachments/")) ||
    (["PUT", "DELETE"].includes(request.method) && !request.headers.authorization)
  ) {
    response.writeHead(403).end();
    return;
  }
  if (request.method === "PUT") {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    objects.set(key, { body: Buffer.concat(chunks), type: request.headers["content-type"] });
    response.writeHead(200, { etag: '"fixture"' }).end();
  } else if (request.method === "DELETE") {
    objects.delete(key);
    response.writeHead(204).end();
  } else if (request.method === "GET" && url.searchParams.has("list-type")) {
    response.writeHead(200, { "content-type": "application/xml" });
    response.end("<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>");
  } else if (request.method === "GET" || request.method === "HEAD") {
    const object = objects.get(key);
    if (!object) response.writeHead(404).end();
    else {
      response.writeHead(200, { "content-type": object.type || "application/octet-stream" });
      response.end(request.method === "HEAD" ? undefined : object.body);
    }
  } else response.writeHead(405).end();
});
await new Promise((resolve, reject) => {
  storage.once("error", reject);
  storage.listen(0, "127.0.0.1", resolve);
});
const storageUrl = `http://127.0.0.1:${storage.address().port}`;
assert.equal((await fetch(`${storageUrl}/attachments/missing`)).status, 403);
assert.equal((await fetch(`${storageUrl}/pictures/probe`, { method: "PUT" })).status, 403);

let supabaseStarted = false;
let exitCode = 1;

try {
  // supabase start har en kjent race mot Docker (og kan rammes av Docker
  // Hub sin rate-limiting på anonyme pulls) — retry med opprydding mellom
  // forsøk, samme mønster som rls-jobben i .github/workflows/ci.yml.
  let started = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    // E2E_SUPABASE_EXCLUDE=edge-runtime hopper over tjenester som ikke starter
    // lokalt (f.eks. edge runtime bak en TLS-inspiserende proxy).
    const exclude = process.env.E2E_SUPABASE_EXCLUDE;
    const start = run("bunx", [
      "supabase",
      "--workdir",
      e2eRoot,
      "start",
      ...(exclude ? ["-x", exclude] : []),
    ]);
    if (start.status === 0) {
      started = true;
      break;
    }
    console.error(`supabase start feilet (forsøk ${attempt}/3), rydder opp og prøver igjen …`);
    run("bunx", ["supabase", "--workdir", e2eRoot, "stop", "--no-backup"]);
  }
  if (!started) {
    throw new Error(
      "Kunne ikke starte isolert lokal Supabase. Kontroller at Docker kjører, og prøv igjen.",
    );
  }
  supabaseStarted = true;

  const local = localSupabaseStatus(e2eRoot);
  if (!local) throw new Error("Lokal Supabase startet, men status kunne ikke leses.");

  const apiUrl = local.get("API_URL");
  const publishableKey = local.get("PUBLISHABLE_KEY") ?? local.get("ANON_KEY");
  const serviceRoleKey = local.get("SERVICE_ROLE_KEY");
  if (!apiUrl || !publishableKey || !serviceRoleKey) {
    throw new Error(
      "Supabase-status mangler API_URL, PUBLISHABLE_KEY/ANON_KEY eller SERVICE_ROLE_KEY.",
    );
  }

  const api = new URL(apiUrl);
  if (api.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(api.hostname)) {
    throw new Error("Teststacken må ha en lokal loopback-adresse.");
  }

  const env = {
    ...process.env,
    E2E_TEST: "1",
    RATE_LIMIT_HMAC_SECRET: randomBytes(32).toString("hex"),
    R2_ENDPOINT: storageUrl,
    R2_ACCOUNT_ID: "",
    R2_REGION: "auto",
    R2_ACCESS_KEY_ID: "fixture-access",
    R2_SECRET_ACCESS_KEY: randomBytes(32).toString("hex"),
    R2_BILDER_BUCKET: "pictures",
    R2_VEDLEGG_BUCKET: "attachments",
    R2_PUBLIC_BASE_URL: `${storageUrl}/pictures`,
    VITE_R2_PUBLIC_BASE_URL: `${storageUrl}/pictures`,
    R2_CLEANUP_SECRET: randomBytes(32).toString("hex"),
    VITE_OPEN_EMAIL: "false",
    VITE_OPEN_LEGAL_PAGES: "false",
    VITE_OPEN_LAYOUT: "hvit",
    VITE_SITE_URL: `http://localhost:${port(18080)}`,
    PLAYWRIGHT_BASE_URL: "",

    LOCAL_SUPABASE_URL: apiUrl,
    LOCAL_SUPABASE_ANON_KEY: publishableKey,
    LOCAL_SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    SUPABASE_PROJECT_ID: projectId,
    SUPABASE_URL: apiUrl,
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    VITE_SUPABASE_PROJECT_ID: projectId,
    VITE_SUPABASE_URL: apiUrl,
    VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    VITE_ENVIRONMENT: "development",
    PLAYWRIGHT_PORT: port(18080),
    PUBLIC_SITE_URL: `http://localhost:${port(18080)}`,
  };

  for (const [command, args] of [
    ["bunx", ["supabase", "--workdir", e2eRoot, "test", "db"]],
    ["bun", ["run", "test:db-migration"]],
    ["bun", ["run", "test:rls"]],
  ]) {
    const result = run(command, args, { env });
    if (result.status !== 0) {
      throw new Error(`Databasekontroll feilet: ${command} ${args.join(" ")}`);
    }
  }
  if (databaseOnly) exitCode = 0;
  else {
    const playwright = await runAsync(
      "bun",
      ["run", "test:e2e:playwright", ...process.argv.slice(2)],
      { env },
    );
    exitCode = playwright.status ?? 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
} finally {
  storage.closeAllConnections();
  storage.close();
  if (supabaseStarted) {
    const stop = run("bunx", ["supabase", "--workdir", e2eRoot, "stop", "--no-backup"]);
    if (stop.status !== 0 && exitCode === 0) exitCode = stop.status ?? 1;
  }
  rmSync(e2eRoot, { recursive: true, force: true });
}

process.exit(exitCode);
