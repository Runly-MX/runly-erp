import { Palette } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@runly/ui'
import { NOTE_BACKGROUND_COLORS } from '../lib/noteColors.js'

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors',
        active ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export function NotesFilters({ value = {}, onChange }) {
  const { type, color, hasImage, hasChecklist } = value
  const isAll = !type && !color && !hasImage && !hasChecklist
  const activeColor = NOTE_BACKGROUND_COLORS.find((c) => c.value && c.value === color)

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      <Chip active={isAll} onClick={() => onChange({})}>Todas</Chip>
      <Chip active={type === 'document'} onClick={() => onChange({ ...value, type: type === 'document' ? undefined : 'document' })}>
        Documentos
      </Chip>
      <Chip active={type === 'canvas'} onClick={() => onChange({ ...value, type: type === 'canvas' ? undefined : 'canvas' })}>
        Lienzos
      </Chip>
      <Chip active={Boolean(hasImage)} onClick={() => onChange({ ...value, hasImage: !hasImage })}>Con imagen</Chip>
      <Chip active={Boolean(hasChecklist)} onClick={() => onChange({ ...value, hasChecklist: !hasChecklist })}>Checklists</Chip>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={[
              'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors',
              color ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {activeColor?.swatch
              ? <span className="h-3 w-3 rounded-sm border border-border" style={{ backgroundColor: activeColor.swatch }} />
              : <Palette size={13} />}
            Color
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-3">
          <div className="flex flex-wrap gap-2">
            {NOTE_BACKGROUND_COLORS.filter((c) => c.value).map((c) => (
              <button
                key={c.value}
                type="button"
                title={c.label}
                aria-label={c.label}
                onClick={() => onChange({ ...value, color: color === c.value ? undefined : c.value })}
                style={{ backgroundColor: c.swatch }}
                className={[
                  'h-8 w-8 rounded-md border',
                  color === c.value ? 'border-2 border-foreground/70' : 'border-border',
                ].join(' ')}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
