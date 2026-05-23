/** RFC 4180-style CSV parsing (quoted fields, commas inside quotes). */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export function parseCsv(content: string): string[][] {
  const text = content.replace(/^\uFEFF/, "");
  const lines: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
      cur += ch;
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      if (cur.trim()) lines.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) lines.push(cur);
  return lines.map(parseCsvLine);
}

export function rowToHeaderMap(header: string[], row: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (let i = 0; i < header.length; i++) {
    const key = header[i]?.trim() ?? "";
    if (!key) continue;
    map.set(key, row[i] ?? "");
  }
  return map;
}

export function getCsvField(map: Map<string, string>, ...names: string[]): string {
  for (const name of names) {
    const direct = map.get(name);
    if (direct !== undefined) return direct.trim();
    const lower = name.toLowerCase();
    for (const [k, v] of map) {
      if (k.trim().toLowerCase() === lower) return v.trim();
    }
  }
  return "";
}
