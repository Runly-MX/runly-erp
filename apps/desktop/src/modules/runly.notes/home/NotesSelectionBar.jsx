import { Archive, ArchiveRestore, Palette, Pin, Trash2, X } from 'lucide-react'
import { Button, Popover, PopoverContent, PopoverTrigger } from '@runly/ui'
import { NOTE_BACKGROUND_COLORS } from '../lib/noteColors.js'

// Bulk actions for the multi-selected cards. The parent decides what each
// action does per note (ownership, confirmation for trash).
export function NotesSelectionBar({ count, archiveView = false, onClear, onPin, onArchive, onTrash, onColor }) {
  return (
    <div className="sticky top-0 z-10 mb-3 flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1.5 shadow-sm">
      <Button type="button" size="sm" variant="ghost" aria-label="Cancelar seleccion" onClick={onClear}>
        <X size={14} /> Cancelar
      </Button>
      <span className="px-2 text-sm font-medium text-foreground">
        {count} {count === 1 ? 'seleccionada' : 'seleccionadas'}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <Button type="button" size="sm" variant="ghost" onClick={onPin}>
          <Pin size={14} /> <span className="hidden sm:inline">Fijar</span>
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onArchive}>
          {archiveView ? <ArchiveRestore size={14} /> : <Archive size={14} />}
          <span className="hidden sm:inline">{archiveView ? 'Desarchivar' : 'Archivar'}</span>
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" size="sm" variant="ghost">
              <Palette size={14} /> <span className="hidden sm:inline">Color</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-3">
            <div className="flex flex-wrap gap-2">
              {NOTE_BACKGROUND_COLORS.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  title={c.label}
                  aria-label={c.label}
                  onClick={() => onColor(c.value)}
                  style={c.swatch ? { backgroundColor: c.swatch } : undefined}
                  className={['h-8 w-8 rounded-md border border-border', c.swatch ? '' : 'bg-card'].join(' ')}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <Button type="button" size="sm" variant="ghost" onClick={onTrash}>
          <Trash2 size={14} /> <span className="hidden sm:inline">Papelera</span>
        </Button>
      </div>
    </div>
  )
}
