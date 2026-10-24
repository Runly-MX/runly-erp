import { useEffect, useRef, useState } from 'react'
import { ImagePlus, ListChecks, Loader2, PenLine, Palette, Pin, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Checkbox, ImageSourceSheet, Input, Popover, PopoverContent, PopoverTrigger, Textarea } from '@runly/ui'
import { useAuth } from '../../../auth/AuthProvider'
import { useCreateNote } from '../hooks/useNotes.js'
import { useUpdateNote } from '../hooks/useNote.js'
import { getImageNaturalSize, uploadNoteImage } from '../lib/noteImageUpload.js'
import { buildQuickNoteContent } from '../lib/quickNoteContent.js'
import { NOTE_BACKGROUND_COLORS, DARK_BG_MAP } from '../lib/noteColors.js'

const MAX_IMAGE_BYTES = 20 * 1024 * 1024

const emptyItem = () => ({ id: Math.random().toString(36).slice(2), text: '', checked: false })

// Keep-style quick composer. Saves on close (button, Escape, click outside or
// Ctrl+Enter); an empty composer just collapses. It never opens the new note.
export function QuickComposer({ onCreated, onCreateCanvas, disabled = false, isDark = false }) {
  const { session } = useAuth()
  const token = session?.access_token
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
  const [images, setImages] = useState([])
  const [uploading, setUploading] = useState(0)
  const [sheetOpen, setSheetOpen] = useState(false)
  const rootRef = useRef(null)
  const bodyRef = useRef(null)
  const itemRefs = useRef({})
  const focusItemId = useRef(null)

  const busy = disabled || createNote.isPending
  const overlayOpen = colorOpen || sheetOpen

  function reset() {
    setOpen(false)
    setMode('text')
    setTitle('')
    setBody('')
    setItems([emptyItem()])
    setColor(null)
    setPinned(false)
    setImages([])
  }

  // Photos upload against the shared 'draft' key (the presign route accepts it),
  // so no note has to exist yet; the note is created once, on save.
  async function attachPhoto(file) {
    if (!file || !token) return
    if (!file.type.startsWith('image/')) { toast.error('Selecciona un archivo de imagen valido.'); return }
    if (file.size > MAX_IMAGE_BYTES) { toast.error('La imagen no puede superar 20 MB.'); return }
    setUploading((n) => n + 1)
    try {
      const [url, size] = await Promise.all([
        uploadNoteImage(file, { noteId: 'draft', token }),
        getImageNaturalSize(file),
      ])
      const aspectRatio = size.naturalWidth && size.naturalHeight ? size.naturalWidth / size.naturalHeight : null
      setImages((prev) => [...prev, { id: Math.random().toString(36).slice(2), url, aspectRatio, alt: file.name }])
    } catch (err) {
      toast.error(err?.message ?? 'No se pudo subir la imagen.')
    } finally {
      setUploading((n) => n - 1)
    }
  }

  function save() {
    if (uploading > 0) return
    const built = buildQuickNoteContent({ mode, title, body, items, images })
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
        onError: (err) => toast.error(err?.message ?? 'No se pudo crear la nota.'),
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
      if (overlayOpen) return
      if (rootRef.current?.contains(e.target)) return
      if (e.target.closest?.('[data-radix-popper-content-wrapper]')) return
      saveRef.current()
    }
    function onKeyDown(e) {
      if (e.key === 'Escape' && !overlayOpen) saveRef.current()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, overlayOpen])

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
          aria-label="Titulo de la nota"
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
            aria-label="Contenido de la nota"
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
                  aria-label="Elemento de la checklist"
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

        {(images.length > 0 || uploading > 0) && (
          <div className="flex flex-wrap gap-2 px-1" aria-label="Fotos adjuntas">
            {images.map((img) => (
              <div key={img.id} className="relative h-16 w-16 overflow-hidden rounded-md border border-border">
                <img src={img.url} alt={img.alt} className="h-full w-full object-cover" />
                <button
                  type="button"
                  aria-label="Quitar foto"
                  onClick={() => setImages((prev) => prev.filter((i) => i.id !== img.id))}
                  className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-md bg-background/80 text-foreground hover:bg-background"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {uploading > 0 && (
              <div className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground" role="status" aria-label="Subiendo foto">
                <Loader2 size={16} className="animate-spin" />
              </div>
            )}
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

        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label="Agregar foto"
          title="Agregar foto"
          disabled={busy}
          onClick={() => setSheetOpen(true)}
        >
          <ImagePlus size={14} />
        </Button>
        <ImageSourceSheet open={sheetOpen} onOpenChange={setSheetOpen} onPickFile={attachPhoto} />

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
                    'h-8 w-8 rounded-md border [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10',
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
          <Button type="button" size="sm" variant="ghost" disabled={busy || uploading > 0} onClick={save}>
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  )
}
