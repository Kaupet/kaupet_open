// package.json har en eksplisitt `sideEffects`-liste: med `"sideEffects": false`
// fjerner bundleren rene side-effekt-importer (`import "./x"`) fra
// produksjonsbygget. Skriptet feiler hvis en src-fil har en
// ren side-effekt-import av en egen modul som ikke står i listen. CSS og
// tester er unntatt.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, matchesGlob, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SIDE_EFFECT_IMPORT = /^\s*import\s+["']([^"']+)["']\s*;?\s*$/gm;

/** Rene side-effekt-importer av egne moduler i `source`, løst til en sti
 * relativ til `root` (f.eks. "src/lib/zod-config.ts"). */
export function sideEffectImports(file, source, root, exists = existsSync) {
  const found = [];
  for (const [, specifier] of source.matchAll(SIDE_EFFECT_IMPORT)) {
    if (/\.css(\?.*)?$/.test(specifier)) continue;
    let base;
    if (specifier.startsWith("@/")) base = join(root, "src", specifier.slice(2));
    else if (specifier.startsWith(".")) base = resolve(root, dirname(file), specifier);
    else continue;
    const target = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find(
      (candidate) => /\.tsx?$/.test(candidate) && exists(candidate),
    );
    found.push(relative(root, target ?? base));
  }
  return found;
}

/** Importene som ikke dekkes av `sideEffects` (stier eller glob, som "./src/x.ts"). */
export function undeclared(imports, sideEffects) {
  const patterns = (Array.isArray(sideEffects) ? sideEffects : []).map((entry) =>
    entry.replace(/^\.\//, ""),
  );
  return imports.filter(
    ({ target }) => !patterns.some((pattern) => target === pattern || matchesGlob(target, pattern)),
  );
}

function main() {
  const root = process.cwd();
  const { sideEffects } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const imports = readdirSync(join(root, "src"), { recursive: true })
    .map((file) => join("src", String(file)))
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .flatMap((file) =>
      sideEffectImports(file, readFileSync(join(root, file), "utf8"), root).map((target) => ({
        file,
        target,
      })),
    );
  const missing = undeclared(imports, sideEffects);
  if (missing.length > 0) {
    console.error(
      "Rene side-effekt-importer av moduler som ikke står i package.json sin sideEffects-liste\n" +
        "(bundleren fjerner dem fra produksjonsbygget):\n" +
        missing.map(({ file, target }) => `  ${file}: ${target}`).join("\n") +
        '\nLegg modulen til i "sideEffects", f.eks. "./' +
        missing[0].target +
        '".',
    );
    process.exit(1);
  }
  console.log(`check:side-effects: ${imports.length} side-effekt-importer, alle deklarert.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
