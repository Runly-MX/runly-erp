export function ContentMatchSnippet({ match }) {
  const words = new Set(match.terms ?? []);
  return <p className="max-w-md truncate text-xs text-muted-foreground" title={match.snippet}>
    {match.source === 'ocr' ? 'OCR' : 'Contenido'}{match.approximate ? ' · Coincidencia aproximada' : ''} · {match.reference}: {' '}
    {match.snippet.split(/(\p{L}[\p{L}\p{N}]*|\p{N}+)/gu).map((part, index) => {
      const normalized = part.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
      return [...words].some(word => normalized.startsWith(word))
        ? <mark key={index} className="rounded bg-amber-200/60 text-inherit dark:bg-amber-500/30">{part}</mark>
        : part;
    })}
  </p>;
}
