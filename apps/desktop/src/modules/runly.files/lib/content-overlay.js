const MAX_MATCHES = 1000;

// Search-only normalization (case, accents, punctuation). Recognized text itself is never rewritten.
export function compact(text) {
  return String(text ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}
export function contentTerms(text) {
  return String(text ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(word => word.length >= 2);
}

// A match is one identifier/word or a run of consecutive words (a phrase split across words).
// Returns [{unit, words:[{...word,index}]}]; navigation and counts are per match, not per word.
export function findMatches(pages, query) {
  const tokens = String(query ?? '').trim().split(/\s+/).map(compact).filter(token => token.length >= 2);
  if (!tokens.length) return [];
  const joined = tokens.join('');
  const matches = [];
  for (const page of pages) {
    const words = page.words ?? [];
    const folded = words.map(word => compact(word.text));
    for (let i = 0; i < words.length && matches.length < MAX_MATCHES; i++) {
      let length = 0;
      if (folded[i].includes(joined)) length = 1; // whole identifier inside one recognized word
      else if (tokens.length > 1 && tokens.every((token, offset) => folded[i + offset]?.includes(token))) length = tokens.length;
      else if (tokens.length === 1 && folded[i].includes(tokens[0])) length = 1;
      if (length) {
        matches.push({ unit: page.unit, words: words.slice(i, i + length).map((word, offset) => ({ ...word, unit: page.unit, index: i + offset })) });
        i += length - 1;
      }
    }
    if (matches.length >= MAX_MATCHES) break;
  }
  return matches;
}
// Kept for callers that only need flat word hits.
export function matchingWords(pages, query) {
  return findMatches(pages, query).flatMap(match => match.words);
}

const sameLine = (previous, word) => word.y <= previous.y + previous.height * 0.6 && word.y + word.height >= previous.y;
// Words are stored in reading order; a line break is inferred geometrically, never invented.
export function lineRange(words, index) {
  let start = index, end = index;
  while (start > 0 && sameLine(words[start - 1], words[start])) start--;
  while (end < words.length - 1 && sameLine(words[end], words[end + 1])) end++;
  return [start, end];
}
export function selectionText(words, selected) {
  const ordered = [...selected].filter(index => words[index]).sort((a, b) => a - b);
  let text = '';
  ordered.forEach((index, position) => {
    const word = words[index];
    if (position) text += sameLine(words[ordered[position - 1]], word) ? ' ' : '\n';
    text += word.text; // exactly the stored OCR text
  });
  return text;
}

export function overlayRotation(width, height, rotation = 0) {
  const angle = ((rotation % 360) + 360) % 360;
  if (angle === 90) return { width: height, height: width, transform: `translate(${height} 0) rotate(90)` };
  if (angle === 180) return { width, height, transform: `translate(${width} ${height}) rotate(180)` };
  if (angle === 270) return { width: height, height: width, transform: `translate(0 ${width}) rotate(270)` };
  return { width, height, transform: '' };
}

// OCR coordinates live in the canvas the worker stored (`engine.canvas`, original EXIF-normalized image).
// The overlay shares that coordinate system through an SVG viewBox, so CSS zoom/pan/resize need no math.
// It is only trustworthy when the displayed bitmap has the same aspect ratio as that canvas.
export function canvasMatches(canvas, natural, tolerance = 0.01) {
  if (!canvas?.width || !canvas?.height) return false;
  if (!natural?.w || !natural?.h) return true; // not measured yet: caller re-checks on load
  return Math.abs(canvas.width / canvas.height - natural.w / natural.h) <= tolerance * (canvas.width / canvas.height);
}
