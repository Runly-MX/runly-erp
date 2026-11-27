import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdvancedFileViewer } from '@runly/ui';
import { toast } from 'sonner';
import { useFileContent } from '../hooks/useFileContent';
import { findMatches, lineRange, selectionText } from '../lib/content-overlay';
import { FileContentPanel } from './FileContentPanel';
import { RecognizedTextLayer } from './RecognizedTextLayer';

const key = (unit, index) => `${unit}:${index}`;

export function FilesContentViewer({ initialQuery = '', ...props }) {
  const file = props.files?.[props.activeIndex];
  const content = useFileContent(file, props.open);
  const [selection, setSelection] = useState({ fileId: null, query: '', index: 0 });
  const [textMode, setTextMode] = useState(false);
  const [picked, setPicked] = useState({ fileId: null, keys: [] });
  const current = selection.fileId === file?.id ? selection : { fileId: file?.id, query: initialQuery, index: 0 };
  const pages = useMemo(() => content.isError ? [] : content.data?.data?.pages ?? [], [content.isError, content.data]);
  const matches = useMemo(() => findMatches(pages, current.query), [pages, current.query]);
  const index = Math.min(current.index, Math.max(0, matches.length - 1));
  const active = matches[index];
  const keys = useMemo(() => new Set(picked.fileId === file?.id ? picked.keys : []), [picked, file?.id]);
  const wordsByUnit = useRef(new Map());
  wordsByUnit.current = new Map(pages.map(page => [page.unit, page.words ?? []]));
  const setKeys = useCallback(next => setPicked({ fileId: file?.id, keys: [...next] }), [file?.id]);
  const toggle = (unit, wordIndex) => { const next = new Set(keys); const k = key(unit, wordIndex); next.has(k) ? next.delete(k) : next.add(k); setKeys(next); };
  const pickLine = (unit, wordIndex, words) => { const [a, b] = lineRange(words, wordIndex); const next = new Set(keys); for (let i = a; i <= b; i++) next.add(key(unit, i)); setKeys(next); };
  const selectedText = () => pages.map(page => selectionText(page.words ?? [], new Set([...keys].filter(k => k.startsWith(`${page.unit}:`)).map(k => Number(k.split(':')[1]))))).filter(Boolean).join('\n');
  const copy = async text => {
    try { await navigator.clipboard.writeText(text); toast.success('Texto copiado'); }
    catch { toast.error('No se pudo copiar. Usa el panel de texto para seleccionarlo.'); }
  };
  const selectAll = () => setKeys(pages.flatMap(page => (page.words ?? []).map((_, i) => key(page.unit, i))));
  const viewer = { query: current.query, setQuery: query => setSelection({ fileId: file?.id, query, index: 0 }), count: matches.length, index,
    navigate: direction => setSelection({ ...current, query: current.query, index: (index + direction + matches.length) % Math.max(1, matches.length) }),
    textMode, selectionCount: keys.size, copySelection: () => copy(selectedText()), selectAll, clearSelection: () => setKeys([]),
    coordinatesMissing: pages.some(page => (page.wordCount ?? page.words?.length ?? 0) > 0 && !page.engine?.canvas) };
  // Ctrl/Cmd+C copies the selected recognized words; Ctrl/Cmd+A selects all; Escape clears. Never while typing in a field.
  useEffect(() => {
    if (!props.open || !textMode) return undefined;
    const onKey = event => {
      if (/^(INPUT|TEXTAREA)$/.test(event.target?.tagName) || event.target?.isContentEditable) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 'c' && keys.size && !window.getSelection()?.toString()) { event.preventDefault(); copy(selectedText()); }
      else if (mod && event.key.toLowerCase() === 'a') { event.preventDefault(); selectAll(); }
      else if (event.key === 'Escape' && keys.size) { event.stopPropagation(); setKeys([]); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
  const layer = (page, extra) => <RecognizedTextLayer file={file} page={page} textMode={textMode} active={active}
    matches={matches.filter(match => match.unit === page?.unit)} selected={new Set([...keys].filter(k => k.startsWith(`${page?.unit}:`)).map(k => Number(k.split(':')[1])))}
    onWord={toggle} onLine={pickLine} {...extra} />;
  return <AdvancedFileViewer {...props} contentPanelKinds={['image', 'pdf']} requestedPdfPage={active?.unit}
    textMode={{ active: textMode, onToggle: () => setTextMode(value => !value) }}
    renderSidePanel={source => <FileContentPanel file={source} viewer={viewer} />}
    renderImageOverlay={(_source, { naturalSize }) => layer(pages[0], { natural: naturalSize })}
    renderPdfOverlay={(_source, { pageNumber, rotation }) => layer(pages.find(page => page.unit === pageNumber), { rotation })}
  />;
}
