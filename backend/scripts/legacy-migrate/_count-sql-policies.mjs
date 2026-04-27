import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const sqlPath = path.join(root, "techuico_insurance.sql");
const t = fs.readFileSync(sqlPath, "utf8");
const byNewline = t.split(/\r?\n/).filter((l) => l.startsWith("('PO-")).length;
const refMatches = t.match(/'RTY[^']+',\s*'20[0-9]{2}-[0-9]{2}'/g) ?? [];
console.log(JSON.stringify({ sqlPath, policyLinesStartingPO: byNewline, refNoYearPairs: refMatches.length }, null, 2));
