import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve a file under `server/config/` when running from `src/` (tsx) or `dist/` (node),
 * or when `process.cwd()` is the `server/` package directory or the monorepo root.
 */
export function resolveServerConfigFile(
  importMetaUrl: string,
  ...configRelative: string[]
): string {
  const fromModule = path.join(
    path.dirname(fileURLToPath(importMetaUrl)),
    "..",
    "..",
    "config",
    ...configRelative,
  );
  const candidates = [
    fromModule,
    path.join(process.cwd(), "config", ...configRelative),
    path.join(process.cwd(), "server", "config", ...configRelative),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  throw new Error(
    `Config file not found: ${path.join("config", ...configRelative)}. Searched:\n${candidates.map((c) => `  - ${c}`).join("\n")}\n(cwd: ${process.cwd()})`,
  );
}
