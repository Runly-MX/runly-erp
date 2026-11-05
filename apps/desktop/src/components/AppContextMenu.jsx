import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Star, StarOff } from 'lucide-react';
import { useAppViewPrefs } from '../hooks/useAppViewPrefs';
import { clampMenuToViewport } from '../lib/moduleLauncher';

export function AppContextMenu({ x, y, moduleKey, onClose }) {
  const { isFavorite, toggleFavorite } = useAppViewPrefs();
  const ref = useRef(null);
  const fav = isFavorite(moduleKey);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') return;
    const rect = el.getBoundingClientRect();
    setPos(
      clampMenuToViewport(
        { x, y },
        { width: rect.width, height: rect.height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [x, y]);

  useEffect(() => {
    function handleDown(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-[300] bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg shadow-lg py-1 min-w-[190px]"
      style={{ top: pos.top, left: pos.left }}
    >
      <button type="button"
        onClick={() => {
          toggleFavorite(moduleKey);
          onClose();
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors cursor-pointer text-left"
      >
        {fav ? (
          <StarOff size={14} className="text-amber-400 shrink-0" />
        ) : (
          <Star size={14} className="shrink-0" />
        )}
        {fav ? 'Quitar de favoritos' : 'Agregar a favoritos'}
      </button>
    </div>
  );
}
