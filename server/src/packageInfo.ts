import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(dir, "../package.json"), "utf8"),
) as { version: string; description?: string };

export const PACKAGE_VERSION = pkg.version;
export const PACKAGE_DESCRIPTION = pkg.description ?? "";
