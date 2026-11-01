// Text corrections for transcripts: validating replacement pairs proposed by
// the AI or learned from user edits, applying them to segments, and deriving a
// pair from a manual edit. Pure helpers plus one Prisma-backed apply step.
//
// A correction never rewrites a sentence: it replaces a whole word or phrase
// (wrong -> right) wherever it appears, and the segment keeps its pre-change
// text in `originalText` so any fix can be reverted.

const MAX_PAIR_CHARS = 60;
const MIN_WRONG_CHARS = 3;
const MAX_PAIRS = 40;
const MAX_EDIT_WORDS = 3;

// Collapses whitespace and strips control characters so a term can't smuggle
// newlines or markup into prompts.
export function cleanTerm(value) {
  return String(value ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f`{}<>\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Whole-word match (letters/digits on either side disqualify it), with any run
// of whitespace in the phrase matching the transcript's own spacing.
export function buildWordRegex(wrong) {
  const body = cleanTerm(wrong).split(" ").map(escapeRegex).join("\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, "giu");
}

export function replaceTerm(text, wrong, right) {
  const regex = buildWordRegex(wrong);
  let count = 0;
  const next = text.replace(regex, () => { count += 1; return right; });
  return { text: next, count };
}

// Keeps only pairs that are safe to apply: short, different from each other,
// and whose "wrong" side literally appears in the transcript. This is what
// stops a model from inventing rewrites.
export function sanitizePairs(pairs, transcriptText) {
  if (!Array.isArray(pairs)) return [];
  const seen = new Set();
  const out = [];
  for (const pair of pairs) {
    const wrong = cleanTerm(pair?.wrong);
    const right = cleanTerm(pair?.right);
    if (wrong.length < MIN_WRONG_CHARS || wrong.length > MAX_PAIR_CHARS) continue;
    if (!right || right.length > MAX_PAIR_CHARS || wrong === right) continue;
    const key = wrong.toLowerCase();
    if (seen.has(key)) continue;
    if (!buildWordRegex(wrong).test(transcriptText)) continue;
    seen.add(key);
    out.push({ wrong, right });
    if (out.length >= MAX_PAIRS) break;
  }
  return out;
}

// What a user changed in one edit, as a single wrong -> right pair; null when
// the edit is not a small word-level replacement (a rewrite, a deletion, an
// insertion) so we never learn from edits that are not corrections.
export function diffReplacement(before, after) {
  const a = String(before ?? "").trim().split(/\s+/).filter(Boolean);
  const b = String(after ?? "").trim().split(/\s+/).filter(Boolean);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA -= 1; endB -= 1; }
  const wrongWords = a.slice(start, endA);
  const rightWords = b.slice(start, endB);
  if (!wrongWords.length || !rightWords.length) return null;
  if (wrongWords.length > MAX_EDIT_WORDS || rightWords.length > MAX_EDIT_WORDS) return null;
  const strip = (words) => words.join(" ").replace(/^[\s.,;:¿?¡!"'()]+|[\s.,;:¿?¡!"'()]+$/g, "");
  const wrong = cleanTerm(strip(wrongWords));
  const right = cleanTerm(strip(rightWords));
  if (wrong.length < MIN_WRONG_CHARS || !right || wrong === right) return null;
  return { wrong, right };
}

// Applies pairs to every segment of a transcript; returns how many times each
// pair was used and how many segments changed. Segments keep their first-seen
// text in originalText.
export async function applyPairsToSegments(prisma, transcriptId, pairs) {
  if (!pairs.length) return { changedSegments: 0, applied: [] };
  const segments = await prisma.callTranscriptSegment.findMany({
    where: { transcriptId },
    select: { id: true, text: true, originalText: true },
  });
  const usage = new Map(pairs.map((pair) => [pair.wrong, 0]));
  let changedSegments = 0;
  for (const segment of segments) {
    let text = segment.text;
    for (const pair of pairs) {
      const result = replaceTerm(text, pair.wrong, pair.right);
      if (result.count) {
        text = result.text;
        usage.set(pair.wrong, usage.get(pair.wrong) + result.count);
      }
    }
    if (text === segment.text) continue;
    await prisma.callTranscriptSegment.update({
      where: { id: segment.id },
      data: { text, originalText: segment.originalText ?? segment.text },
    });
    changedSegments += 1;
  }
  const applied = pairs
    .map((pair) => ({ ...pair, count: usage.get(pair.wrong) }))
    .filter((pair) => pair.count > 0);
  return { changedSegments, applied };
}
