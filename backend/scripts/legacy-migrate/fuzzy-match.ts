import { normalizeLegacyText } from "./normalize.js";

export const DEFAULT_FUZZY_THRESHOLD = 0.92;

/** Levenshtein distance between two strings. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const row = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) row[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1]! + 1, row[j]! + 1, prev + cost);
      prev = temp;
    }
  }
  return row[b.length]!;
}

/** Similarity ratio 0..1 (1 = identical). */
export function similarityRatio(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

export interface FuzzyCandidate {
  key: string;
  value: string;
  label: string;
}

export interface FuzzyMatchResult {
  match: FuzzyCandidate;
  score: number;
}

/**
 * Find best fuzzy match among candidates (same normalized key bucket when possible).
 */
export function findBestFuzzyMatch(
  raw: string,
  candidates: FuzzyCandidate[],
  threshold = DEFAULT_FUZZY_THRESHOLD,
): FuzzyMatchResult | null {
  const normalized = normalizeLegacyText(raw);
  if (!normalized) return null;

  const exact = candidates.find((c) => c.key === normalized);
  if (exact) return { match: exact, score: 1 };

  const firstChar = normalized[0];
  const pool = candidates.filter((c) => !firstChar || c.key[0] === firstChar);
  const search = pool.length > 0 ? pool : candidates;

  let best: FuzzyMatchResult | null = null;
  for (const c of search) {
    const score = similarityRatio(normalized, c.key);
    if (score >= threshold && (!best || score > best.score)) {
      best = { match: c, score };
    }
  }
  return best;
}
