import { useEffect, useRef } from 'react';
import { useFileContent } from '../hooks/useFileContent';
import { canvasMatches, overlayRotation } from '../lib/content-overlay';

const MAX_WORD_NODES = 2500; // above this only matches/selection are drawn: bounded DOM on dense pages

// Independent, reversible SVG layer over the original image/page. It shares the OCR canvas coordinate system through
// the viewBox, so the viewer's own CSS zoom/pan/resize/rotation moves it with the bitmap without extra math.
export function RecognizedTextLayer({ file, page, matches, active, textMode, selected, onWord, onLine, onRange, natural = null, rotation = 0 }) {
  const drag = useRef(null);
  useEffect(() => {
    // The click that ends a drag must still see it, so the anchor is cleared one tick after the pointer is released.
    const release = () => { if (drag.current) setTimeout(() => { drag.current = null; }, 0); };
    window.addEventListener('pointerup', release);
    return () => window.removeEventListener('pointerup', release);
  }, []);
  const needsWords = Boolean(page?.wordsOmitted);
  const fetched = useFileContent(file, needsWords, page?.unit);
  const words = needsWords ? fetched.data?.data?.pages?.find(item => item.unit === page.unit)?.words ?? [] : page?.words ?? [];
  const canvas = page?.engine?.canvas;
  if (!canvasMatches(canvas, natural) || !words.length) return null;
  const layout = overlayRotation(canvas.width, canvas.height, rotation);
  const stroke = Math.max(1, canvas.width / 1000);
  const hit = new Map();
  matches.forEach((match, matchIndex) => match.words.forEach(word => hit.set(word.index, matchIndex)));
  const activeSet = new Set(active?.words.map(word => word.index));
  const interactive = textMode && words.length <= MAX_WORD_NODES;
  const visible = interactive ? words.map((word, index) => [word, index]) : [...hit.keys()].map(index => [words[index], index]);
  return <svg data-ocr-overlay="" role="group" aria-label={textMode ? 'Texto reconocido seleccionable' : 'Coincidencias del texto reconocido'}
    className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${layout.width} ${layout.height}`} preserveAspectRatio="none">
    <g transform={layout.transform}>{visible.filter(([word]) => word).map(([word, index]) => {
      const isHit = hit.has(index), isSelected = selected?.has(index);
      const Shape = word.polygon ? 'polygon' : 'rect';
      const shape = word.polygon ? { points: word.polygon.join(' ') } : { x: word.x, y: word.y, width: word.width, height: word.height };
      return <Shape key={index} {...shape}
        data-selected={isSelected ? '' : undefined} data-match={activeSet.has(index) ? 'active' : isHit ? 'hit' : undefined}
        fill={isSelected ? '#3b82f6' : activeSet.has(index) ? '#fb923c' : isHit ? '#facc15' : 'transparent'} fillOpacity={isSelected ? 0.35 : isHit ? 0.35 : 0}
        stroke={isSelected ? '#2563eb' : isHit ? '#f59e0b' : interactive ? '#94a3b8' : 'none'} strokeOpacity={interactive && !isHit && !isSelected ? 0.45 : 1} strokeWidth={stroke}
        style={interactive ? { pointerEvents: 'all', cursor: 'text' } : undefined}
        onPointerDown={interactive ? event => {
          event.stopPropagation(); // words are never a pan handle; touch keeps its own gestures
          if (event.pointerType === 'mouse' && event.button === 0) drag.current = { anchor: index, moved: false };
        } : undefined}
        onPointerEnter={interactive ? event => {
          const state = drag.current;
          if (!state || event.buttons !== 1 || index === state.anchor && !state.moved) return;
          onRange?.(page.unit, state.anchor, index, !state.moved); state.moved = true;
        } : undefined}
        onClick={interactive ? event => { event.stopPropagation(); if (drag.current?.moved) return; onWord(page.unit, index); } : undefined}
        onDoubleClick={interactive ? event => { event.stopPropagation(); onLine(page.unit, index, words); } : undefined} />;
    })}</g>
  </svg>;
}
