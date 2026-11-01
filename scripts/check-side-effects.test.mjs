import assert from "node:assert/strict";
import { test } from "node:test";
import { sideEffectImports, undeclared } from "./check-side-effects.mjs";

const root = "/repo";
const files = new Set(["/repo/src/lib/zod-config.ts", "/repo/src/lib/vehicle/register.ts"]);
const exists = (path) => files.has(path);

test("finner rene side-effekt-importer av egne moduler, ikke CSS, pakker eller navngitte", () => {
  const source = [
    'import "./lib/zod-config";',
    'import "@/lib/vehicle/register";',
    'import "./styles.css";',
    'import "@fontsource/inter";',
    'import { x } from "./lib/x";',
  ].join("\n");
  assert.deepEqual(sideEffectImports("src/router.tsx", source, root, exists), [
    "src/lib/zod-config.ts",
    "src/lib/vehicle/register.ts",
  ]);
});

test("feiler for en side-effekt-import som ikke står i sideEffects", () => {
  const imports = [
    { file: "src/router.tsx", target: "src/lib/zod-config.ts" },
    { file: "src/router.tsx", target: "src/lib/vehicle/register.ts" },
  ];
  assert.deepEqual(undeclared(imports, ["./src/lib/zod-config.ts"]), [imports[1]]);
  assert.deepEqual(undeclared(imports, ["./src/lib/**/*.ts"]), []);
  assert.deepEqual(undeclared(imports, false), imports);
});
