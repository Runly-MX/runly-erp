import { useEffect, useRef, useState } from 'react'
import { ListChecks, PenLine, Palette, Pin, Plus } from 'lucide-react'
import { Button, Checkbox, Input, Popover, PopoverContent, PopoverTrigger, Textarea } from '@runly/ui'
import { useCreateNote } from '../hooks/useNotes.js'
import { useUpdateNote } from '../hooks/useNote.js'
import { buildQuickNoteContent } from '../lib/quickNoteContent.js'
import { NOTE_BACKGROUND_COLORS, DARK_BG_MAP } from '../lib/noteColors.js'

const emptyItem = () => ({ id: Math.random().toString(36).slice(2), text: '', checked: false })

// Keep-style quick composer. Saves on close (button, Escape, click outside or
// Ctrl+Enter); an empty composer just collapses. It never opens the new note.
export function QuickComposer({ onCreated, onCreateCanvas, disabled = false, isDark = false }) {
  const createNote = useCreateNote()
  const updateNote = useUpdateNote()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('text')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [items, setItems] = useState(() => [emptyItem()])
  const [color, setColor] = useState(null)
  const [pinned, setPinned] = useState(false)
  const [colorOpen, setColorOpen] = useState(false)
  const rootRef = useRef(null)
  const bodyRef = useRef(null)
  const itemRefs = useRef({})
  const focusItemId = useRef(null)

  const busy = disabled || createNote.isPending

  function reset() {
    setOpen(false)
    setMode('text')
    setTitle('')
    setBody('')
    setItems([emptyItem()])
    setColor(null)
    setPinned(false)
  }

  function save() {
    const built = buildQuickNoteContent({ mode, title, body, items })
    if (!built) { reset(); return }
    const wantsPin = pinned
    createNote.mutate(
      { title: built.title, content: built.content, backgroundColor: color, noteType: 'document' },
      {
        onSuccess: (res) => {
          if (wantsPin && res?.note?.id) {
            updateNote.mutate({ noteId: res.note.id, data: { isPinned: true } })
          }
          if (res?.note) onCreated?.(res.note)
        },
      },
    )
    reset()
  }

  // Latest save() for the document-level listeners below.
  const saveRef = useRef(save)
  saveRef.current = save

  useEffect(() => {
    if (!open) return undefined
    function onPointerDown(e) {
      if (colorOpen) return
      if (rootRef.current?.contains(e.target)) return
      if (e.target.closest?.('[data-radix-popper-content-wrapper]')) return
      saveRef.current()
    }
    function onKeyDown(e) {
      if (e.key === 'Escape' && !colorOpen) saveRef.current()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, colorOpen])

  // Autosize the body textarea.
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`
  }, [body, open, mode])

  useEffect(() => {
    if (focusItemId.current && itemRefs.current[focusItemId.current]) {
      itemRefs.current[focusItemId.current].focus()
      focusItemId.current = null
    }
  }, [items])

  function expand(nextMode = 'text') {
    if (busy) return
    setMode(nextMode)
    setOpen(true)
  }

  function updateItem(id, patch) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }

  function addItemAfter(id) {
    const fresh = emptyItem()
    focusItemId.current = fresh.id
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === id)
      const next = [...prev]
      next.splice(idx + 1, 0, fresh)
      return next
    })
  }

  function removeItem(id) {
    setItems((prev) => {
      if (prev.length <= 1) return prev
      const idx = prev.findIndex((i) => i.id === id)
      const target = prev[Math.max(0, idx - 1)]
      focusItemId.current = target.id === id ? prev[1]?.id : target.id
      return prev.filter((i) => i.id !== id)
    })
  }

  function onCtrlEnter(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      save()
    }
  }

  if (!open) {
    return (
      <div className="mx-auto w-full max-w-xl">
        <div className="flex items-center rounded-md border border-border bg-card shadow-sm">
          <button
            type="button"
            disabled={busy}
            onClick={() => expand('text')}
            className="flex min-h-11 flex-1 items-center px-4 text-left text-sm text-muted-foreground disabled:opacity-50"
          >
            Escribe una nota...
          </button>
          <button
            type="button"
            disabled={busy}
            aria-label="Nueva checklist"
            title="Nueva checklist"
            onClick={() => expand('checklist')}
            className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <ListChecks size={18} />
          </button>
          <button
            type="button"
            disabled={busy}
            aria-label="Nuevo dibujo"
            title="Nuevo dibujo"
            onClick={() => onCreateCanvas?.()}
            className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <PenLine size={18} />
          </button>
        </div>
      </div>
    )
  }

  const raw = color
  const bg = raw ? (isDark ? (DARK_BG_MAP[raw] ?? raw) : raw) : undefined

  return (
    <div
      ref={rootRef}
      onKeyDown={onCtrlEnter}
      style={bg ? { backgroundColor: bg } : undefined}
      className={`mx-auto w-full max-w-xl rounded-md border border-border shadow-md ${bg ? '' : 'bg-card'}`}
    >
      <div className="space-y-2 p-3">
        <Input
          autoFocus={mode === 'text'}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titulo"
          disabled={busy}
          spellCheck={false}
          autoCorrect="off"
          enterKeyHint="next"
          className="border-0 bg-transparent px-1 font-medium shadow-none"
        />

        {mode === 'text' ? (
          <Textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escribe una nota..."
            disabled={busy}
            rows={3}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            className="min-h-[72px] resize-none border-0 bg-transparent px-1 shadow-none"
          />
        ) : (
          <div className="space-y-1">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <Checkbox
                  checked={item.checked}
                  onCheckedChange={(v) => updateItem(item.id, { checked: v === true })}
                  aria-label="Marcar elemento"
                />
                <Input
                  ref={(el) => { itemRefs.current[item.id] = el }}
                  autoFocus={items[0].id === item.id && !title}
                  value={item.text}
                  onChange={(e) => updateItem(item.id, { text: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) { e.preventDefault(); addItemAfter(item.id) }
                    if (e.key === 'Backspace' && item.text === '') { e.preventDefault(); removeItem(item.id) }
                  }}
                  placeholder="Elemento"
                  disabled={busy}
                  spellCheck={false}
                  autoCorrect="off"
                  enterKeyHint="next"
                  className="h-9 border-0 bg-transparent px-1 shadow-none"
                />
              </div>
            ))}
            <Button type="button" size="sm" variant="ghost" onClick={() => addItemAfter(items[items.length - 1].id)}>
              <Plus size={14} /> Elemento
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1 border-t border-border/60 px-2 py-1.5">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-pressed={mode === 'text'}
          className={mode === 'text' ? 'bg-muted' : ''}
          onClick={() => setMode('text')}
        >
          Texto
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-pressed={mode === 'checklist'}
          className={mode === 'checklist' ? 'bg-muted' : ''}
          onClick={() => setMode('checklist')}
        >
          <ListChecks size={14} /> Checklist
        </Button>

        <Popover open={colorOpen} onOpenChange={setColorOpen}>
          <PopoverTrigger asChild>
            <Button type="button" size="sm" variant="ghost" aria-label="Color de la nota">
              <Palette size={14} />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-3">
            <div className="flex flex-wrap gap-2">
              {NOTE_BACKGROUND_COLORS.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  title={c.label}
                  aria-label={c.label}
                  onClick={() => { setColor(c.value); setColorOpen(false) }}
                  style={c.swatch ? { backgroundColor: c.swatch } : undefined}
                  className={[
                    'h-8 w-8 rounded-md border',
                    c.swatch ? '' : 'bg-card',
                    color === c.value ? 'border-2 border-foreground/70' : 'border-border',
                  ].join(' ')}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-pressed={pinned}
          aria-label={pinned ? 'Quitar fijado' : 'Fijar nota'}
          className={pinned ? 'bg-muted' : ''}
          onClick={() => setPinned((v) => !v)}
        >
          <Pin size={14} className={pinned ? 'fill-current' : ''} />
        </Button>

        <div className="ml-auto">
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={save}>
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  )
}
