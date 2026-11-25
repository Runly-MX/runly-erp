import { normalizeText } from './policy.js';

// At most one visually confusable character, only for long mixed identifiers.
// This representation never replaces stored OCR text or ordinary prose queries.
export function searchQuery(value) {
  const normalized = normalizeText(String(value ?? '').trim().slice(0,200));
  const terms = normalized.split(' ').filter(Boolean);
  const variants = [];
  if (/^(?=.*[a-z])(?=.*[0-9])[a-z0-9]{6,32}$/.test(normalized)) {
    const pairs = { o:'0',0:'o',i:'1',1:'i',b:'8',8:'b' };
    for (let i=0;i<normalized.length && variants.length<8;i++) {
      if (pairs[normalized[i]]) variants.push(normalized.slice(0,i)+pairs[normalized[i]]+normalized.slice(i+1));
    }
  }
  const exact = String(value).includes('"') ? terms.join(' <-> ') : terms.map(term=>`${term}:*`).join(' & ');
  return { normalized,terms,exact,expanded:variants.length?`(${exact}) | (${variants.join(' | ')})`:exact };
}
