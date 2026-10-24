import { useMemo, useRef } from 'react'
import { MoreVertical, Pin, PinOff, Archive, ArchiveRestore, Trash2, LogOut, Shapes, Users, Check, Layers } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from '@runly/ui'
import { NoteIcon } from '../noteIcons.jsx'
import { extractPreview } from '../lib/notePreview.js'
import { NOTE_BACKGROUND_COLORS, DARK_BG_MAP } from '../lib/noteColors.js'

const LONG_PRESS_MS = 500
const MOVE_TOLERANCE_PX = 8

// Keep-style note card. Display only: the preview comes from the list row's
// HTML snapshot, so checklist rows are not interactive here.
export function NoteGridCard({
  note, selected = false, selectMode = false, isDark = false, readOnly = false,
  onOpen, onToggleSelect, onPin, onArchive, onTrash, onColor,
}) {
  const preview = useMemo(() => extractPreview(note.content, note.title), [note.content, note.title])
  const press = useRef(null)
  const longPressed = useRef(false)

  const raw = note.background_color ?? null
  const bg = raw ? (isDark ? (DARK_BG_MAP[raw] ?? raw) : raw) : undefined
  const isOwner = note.is_owner !== false
  const isShared = !isOwner || Boolean(note.my_share_permission)

  function clearPress() {
    if (press.current?.timer) clearTimeout(press.current.timer)
    press.current = null
  }

  function onPointerDown(e) {
    longPressed.current = false
    if (e.pointerType === 'mouse' || !onToggleSelect) return
    const timer = setTimeout(() => {
      longPressed.current = true
      onToggleSelect(note)
    }, LONG_PRESS_MS)
    press.current = { x: e.clientX, y: e.clientY, timer }
  }

  function onPointerMove(e) {
    const p = press.current
    if (!p) return
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE_PX) clearPress()
  }

  function handleClick() {
    if (longPressed.current) { longPressed.current = false; return }
    if (selectMode) onToggleSelect?.(note)
    else onOpen?.(note)
  }

  const tags = note.tags ?? []
  const showMenu = !selectMode && (onPin || onArchive || onTrash || onColor)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === 'Enter') handleClick() }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={clearPress}
      onPointerCancel={clearPress}
      onPointerLeave={clearPress}
      onContextMenu={(e) => { if (longPressed.current) e.preventDefault() }}
      style={bg ? { backgroundColor: bg } : undefined}
      className={[
        'group relative cursor-pointer overflow-hidden rounded-md border transition-colors select-none',
        bg ? '' : 'bg-card',
        selected ? 'border-2 border-foreground/60' : 'border-border hover:border-foreground/30',
      ].join(' ')}
    >
      {preview.firstImage && (
        <img
          src={preview.firstImage}
          alt=""
          loading="lazy"
          draggable={false}
          className="w-full max-h-40 object-cover"
        />
      )}

      <div className="p-3 pr-11">
        <div className="flex items-start gap-1.5">
          {note.icon ? (
            <NoteIcon name={note.icon} size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
          ) : note.note_type === 'canvas' ? (
            <Shapes size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
          ) : null}
          <h3 className="line-clamp-2 text-sm font-medium text-foreground">
            {note.title || 'Sin titulo'}
          </h3>
        </div>

        {preview.checklist ? (
          <div className="mt-2 space-y-1">
            {preview.checklist.items.map((item, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span
                  aria-hidden="true"
                  className={[
                    'mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border',
                    item.checked ? 'border-muted-foreground/60 bg-muted-foreground/30' : 'border-muted-foreground/60',
                  ].join(' ')}
                >
                  {item.checked && <Check size={10} className="text-foreground" />}
                </span>
                <span className={item.checked ? 'text-muted-foreground line-through' : 'text-foreground/90'}>
                  {item.text}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-0.5 text-[11px] text-muted-foreground">
              <span>{preview.checklist.total > 5 ? `+${preview.checklist.total - 5} más` : ''}</span>
              <span>{preview.checklist.done}/{preview.checklist.total}</span>
            </div>
          </div>
        ) : preview.excerpt ? (
          <p className="mt-1.5 line-clamp-6 text-xs leading-relaxed text-muted-foreground">{preview.excerpt}</p>
        ) : null}

        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => (
              <span key={tag.id} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {tag.name}
              </span>
            ))}
            {tags.length > 3 && <span className="self-center text-[10px] text-muted-foreground">+{tags.length - 3}</span>}
          </div>
        )}

        {(isShared || note.child_count > 0) && (
          <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
            {isShared && <span className="flex items-center gap-1"><Users size={11} /> Compartida</span>}
            {note.child_count > 0 && (
              <span className="flex items-center gap-1" title="Subpaginas">
                <Layers size={11} aria-hidden="true" /> {note.child_count}
              </span>
            )}
          </div>
        )}
      </div>

      {note.is_pinned && (
        <Pin size={13} className="absolute right-3 top-3 fill-current text-muted-foreground group-hover:opacity-0 [@media(pointer:coarse)]:group-hover:opacity-100" />
      )}

      {showMenu && (
        <div className="absolute right-0 top-0" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Acciones de la nota"
                className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 [@media(pointer:coarse)]:opacity-100"
              >
                <MoreVertical size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {onPin && !readOnly && (
                <DropdownMenuItem onSelect={() => onPin(note)}>
                  {note.is_pinned ? <PinOff size={14} className="mr-2" /> : <Pin size={14} className="mr-2" />}
                  {note.is_pinned ? 'Desfijar' : 'Fijar'}
                </DropdownMenuItem>
              )}
              {onArchive && !readOnly && isOwner && (
                <DropdownMenuItem onSelect={() => onArchive(note)}>
                  {note.is_archived ? <ArchiveRestore size={14} className="mr-2" /> : <Archive size={14} className="mr-2" />}
                  {note.is_archived ? 'Desarchivar' : 'Archivar'}
                </DropdownMenuItem>
              )}
              {onColor && !readOnly && isOwner && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Color</DropdownMenuLabel>
                  <div className="flex flex-wrap gap-1.5 px-2 pb-2">
                    {NOTE_BACKGROUND_COLORS.map((c) => (
                      <button
                        key={c.label}
                        type="button"
                        title={c.label}
                        aria-label={c.label}
                        onClick={() => onColor(note, c.value)}
                        style={c.swatch ? { backgroundColor: c.swatch } : undefined}
                        className={[
                          'h-6 w-6 rounded-md border',
                          c.swatch ? '' : 'bg-card',
                          (note.background_color ?? null) === c.value ? 'border-2 border-foreground/70' : 'border-border',
                        ].join(' ')}
                      />
                    ))}
                  </div>
                </>
              )}
              {onTrash && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => onTrash(note)} className="text-destructive">
                    {isOwner ? <Trash2 size={14} className="mr-2" /> : <LogOut size={14} className="mr-2" />}
                    {isOwner ? 'Mover a papelera' : 'Salir de la nota'}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  )
}
