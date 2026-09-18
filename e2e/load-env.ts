import fs from "node:fs";
import path from "node:path";

/** Load `e2e/.env` into `process.env` (does not override existing vars). */
export function loadE2eEnv(envFile = path.join(__dirname, ".env")): void {
  if (!fs.existsSync(envFile)) {
    return;
  }
  const text = fs.readFileSync(envFile, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq < 1) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
