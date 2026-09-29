/** Lightweight fuzzy matching used to reconcile extracted rows against the existing catalog. */

export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

function editSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(a.split(' ').filter(Boolean));
  const tb = new Set(b.split(' ').filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection++;
  return intersection / (ta.size + tb.size - intersection);
}

/** Score in [0, 1] — higher means more likely to be the same product. */
export function nameSimilarity(rawA: string, rawB: string): number {
  const a = normalizeName(rawA);
  const b = normalizeName(rawB);
  if (!a || !b) return 0;
  if (a === b) return 1;
  // Exact containment ("amoxicillin 500mg" vs "amoxicillin 500mg tablets") scores well.
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  const containment = longer.includes(shorter) ? 0.82 + (shorter.length / longer.length) * 0.1 : 0;
  return Math.max(editSimilarity(a, b), tokenSimilarity(a, b), Math.min(containment, 0.97));
}

export function bestMatch<T extends { name: string }>(
  candidates: T[],
  target: string,
  threshold = 0.72
): { item: T; score: number } | null {
  let best: { item: T; score: number } | null = null;
  for (const item of candidates) {
    const score = nameSimilarity(item.name, target);
    if (!best || score > best.score) best = { item, score };
  }
  if (best && best.score >= threshold) return best;
  return null;
}
