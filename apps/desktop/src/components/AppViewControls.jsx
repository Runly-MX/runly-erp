import { LayoutGrid, List, Star } from 'lucide-react';
import { useAppViewPrefs } from '../hooks/useAppViewPrefs';

export function AppViewControls({ className = '' }) {
  const {
    sortMode, viewMode, favoritesFirst,
    setSortMode, setViewMode, toggleFavoritesFirst,
  } = useAppViewPrefs();

  const activeToggle = 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm';
  const inactiveToggle =
    'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Sort mode */}
      <div className="flex bg-[hsl(var(--muted))] rounded-md p-0.5 text-xs">
        <button type="button"
          onClick={() => setSortMode('az')}
          className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
            sortMode === 'az' ? activeToggle : inactiveToggle
          }`}
        >
          A-Z
        </button>
        <button type="button"
          onClick={() => setSortMode('groups')}
          className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
            sortMode === 'groups' ? activeToggle : inactiveToggle
          }`}
        >
          Grupos
        </button>
      </div>

      {/* View mode */}
      <div className="flex bg-[hsl(var(--muted))] rounded-md p-0.5">
        <button type="button"
          onClick={() => setViewMode('cards')}
          className={`p-1 rounded transition-colors cursor-pointer ${
            viewMode === 'cards' ? activeToggle : inactiveToggle
          }`}
          title="Vista tarjetas"
        >
          <LayoutGrid size={13} />
        </button>
        <button type="button"
          onClick={() => setViewMode('list')}
          className={`p-1 rounded transition-colors cursor-pointer ${
            viewMode === 'list' ? activeToggle : inactiveToggle
          }`}
          title="Vista lista"
        >
          <List size={13} />
        </button>
      </div>

      {/* Favorites first */}
      <button type="button"
        onClick={toggleFavoritesFirst}
        className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors cursor-pointer ${
          favoritesFirst
            ? 'text-amber-400'
            : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
        }`}
        title="Favoritos primero"
      >
        <Star size={12} className={favoritesFirst ? 'fill-amber-400' : ''} />
        Favoritos
      </button>
    </div>
  );
}
