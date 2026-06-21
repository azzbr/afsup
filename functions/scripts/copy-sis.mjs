// Build step: copy the single-source-of-truth SIS modules from school-ops into
// functions/src/sis so the Cloud Function compiles the SAME oracle-validated
// parser/metrics. The copy is generated (git-ignored) and must never be hand-
// edited — change school-ops/src/sis/* instead. Tests (__tests__) are excluded.
//
// Runs before tsc via the functions "build" script.

import { cpSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "school-ops", "src", "sis");
const dest = join(here, "..", "src", "sis");

if (!existsSync(src)) {
  console.error(`[copy-sis] source not found: ${src}`);
  process.exit(1);
}

if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });

cpSync(src, dest, {
  recursive: true,
  filter: (p) => !p.includes("__tests__"),
});

console.log(`[copy-sis] copied ${src} -> ${dest} (excluding __tests__)`);
