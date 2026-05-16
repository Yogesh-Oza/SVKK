import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type DataMdSection = "AREA" | "VILLAGE";

export type ParsedDataMd = {
  areas: string[];
  villages: string[];
};

const MAX_VALUE_LEN = 64;
const MAX_LABEL_LEN = 128;

/**
 * Parses backend/data.md: first block under "Area" → AREA, under "Village" → VILLAGE.
 */
export function parseDataMd(content: string): ParsedDataMd {
  const areas: string[] = [];
  const villages: string[] = [];
  let section: DataMdSection | null = null;

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const lower = line.toLowerCase();
    if (lower === "area") {
      section = "AREA";
      continue;
    }
    if (lower === "village") {
      section = "VILLAGE";
      continue;
    }

    if (section === "AREA") {
      areas.push(line);
    } else if (section === "VILLAGE") {
      villages.push(line);
    }
  }

  return { areas: dedupePreserveOrder(areas), villages: dedupePreserveOrder(villages) };
}

function dedupePreserveOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function loadDataMdFromRepo(repoRoot?: string): ParsedDataMd {
  const root = repoRoot ?? resolve(process.cwd());
  const path = resolve(root, "data.md");
  const content = readFileSync(path, "utf8");
  return parseDataMd(content);
}

export function toDropdownRow(name: string, sortOrder: number): {
  value: string;
  label: string;
  sortOrder: number;
} {
  const label = name.length > MAX_LABEL_LEN ? name.slice(0, MAX_LABEL_LEN) : name;
  const value = name.length > MAX_VALUE_LEN ? name.slice(0, MAX_VALUE_LEN) : name;
  return { value, label, sortOrder };
}
