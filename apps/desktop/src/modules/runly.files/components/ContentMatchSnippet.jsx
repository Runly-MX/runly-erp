const PARTS = /(\p{L}[\p{L}\p{N}]*|\p{N}+)/gu;

// `tight` (grid tiles): two lines, starting just before the first match so the highlight is always visible.
export function ContentMatchSnippet({ match, tight = false }) {
  const words = [...new Set(match.terms ?? [])];
  const isHit = part => { const normalized = part.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase(); return words.some(word => normalized.startsWith(word)); };
  let parts = match.snippet.split(PARTS);
  if (tight) {
    const first = parts.findIndex((part, index) => index % 2 === 1 && isHit(part));
    if (first > 2) parts = ['…', ...parts.slice(first - 2)];
  }
  return <p className={`${tight ? 'line-clamp-2 break-words' : 'max-w-md truncate'} text-xs text-muted-foreground`} title={match.snippet}>
    {match.source === 'ocr' ? 'OCR' : 'Contenido'}{match.approximate ? ' · Coincidencia aproximada' : ''}{tight ? ': ' : ` · ${match.reference}: `}
    {parts.map((part, index) => index % 2 === 1 && isHit(part)
      ? <mark key={index} className="rounded bg-amber-200/60 text-inherit dark:bg-amber-500/30">{part}</mark>
      : part)}
  </p>;
}
