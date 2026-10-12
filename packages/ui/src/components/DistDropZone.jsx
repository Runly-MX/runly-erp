import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Upload, FileArchive, X, Camera, User } from 'lucide-react'
import { cn } from '../lib/utils.js'

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function validateFile(file, accept, maxSizeMB) {
  if (accept) {
    const acceptList = accept.split(',').map(s => s.trim().toLowerCase())
    const fileName = file.name.toLowerCase()
    const mimeType = (file.type || '').toLowerCase()
    const matches = acceptList.some(a => {
      if (a.startsWith('.')) return fileName.endsWith(a)
      if (a.endsWith('/*')) return mimeType.startsWith(a.slice(0, -1))
      return mimeType === a
    })
    if (!matches) return `Tipo de archivo no permitido. Solo se aceptan: ${accept}`
  }
  if (maxSizeMB && file.size > maxSizeMB * 1024 * 1024) {
    return `El archivo supera el limite de ${maxSizeMB} MB`
  }
  return null
}

function cls(...args) {
  return args.filter(Boolean).join(' ')
}

// ─── Full-screen overlay ──────────────────────────────────────────────────────

function PageOverlay({ overlayLabel, overlayHint }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div className="absolute inset-4 rounded-3xl bg-[var(--brand-primary)]/8 border-2 border-dashed border-[var(--brand-primary)]/50 backdrop-blur-sm" />
      <div className="relative flex flex-col items-center gap-4 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-3xl border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/15">
          <Upload className="h-12 w-12 text-[var(--brand-primary)]" />
        </div>
        <div className="space-y-1">
          <p className="text-2xl font-bold text-[hsl(var(--foreground))]">{overlayLabel}</p>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">{overlayHint}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Shared page-drag hook ────────────────────────────────────────────────────
// onDrop is called with File[] (array always, even for single-file drops)

function usePageDrag({ enabled, isUploading, onDrop }) {
  const [isDraggingPage, setIsDraggingPage] = useState(false)
  const dragCounter = useRef(0)

  useEffect(() => {
    if (!enabled) return

    const onEnter = (e) => {
      e.preventDefault()
      dragCounter.current++
      if (dragCounter.current === 1) setIsDraggingPage(true)
    }
    const onLeave = (e) => {
      e.preventDefault()
      dragCounter.current = Math.max(0, dragCounter.current - 1)
      if (dragCounter.current === 0) setIsDraggingPage(false)
    }
    const onOver = (e) => e.preventDefault()
    const onDropDoc = (e) => {
      e.preventDefault()
      dragCounter.current = 0
      setIsDraggingPage(false)
      if (!isUploading) {
        const files = Array.from(e.dataTransfer.files ?? [])
        if (files.length) onDrop(files)
      }
    }

    document.addEventListener('dragenter', onEnter)
    document.addEventListener('dragleave', onLeave)
    document.addEventListener('dragover', onOver)
    document.addEventListener('drop', onDropDoc)
    return () => {
      document.removeEventListener('dragenter', onEnter)
      document.removeEventListener('dragleave', onLeave)
      document.removeEventListener('dragover', onOver)
      document.removeEventListener('drop', onDropDoc)
    }
  }, [enabled, isUploading])

  return isDraggingPage
}

// ─── Default variant ──────────────────────────────────────────────────────────

function DefaultZone({
  onFile, onFiles, multiple = false, accept, maxSizeMB, isUploading, file, onClear,
  emptyLabel, emptyHint, dragActiveLabel, error,
  fullScreenOverlay, overlayLabel, overlayHint,
}) {
  const [isDraggingZone, setIsDraggingZone] = useState(false)
  const [localError, setLocalError] = useState(null)
  const inputRef = useRef(null)

  function pick(f) {
    if (!f) return
    const err = validateFile(f, accept, maxSizeMB)
    if (err) { setLocalError(err); return }
    setLocalError(null)
    if (inputRef.current) inputRef.current.value = ''
    onFile?.(f)
  }

  function pickMany(files) {
    const all = Array.isArray(files) ? files : Array.from(files)
    if (!all.length) return
    const valid = []
    const bad = []
    for (const f of all) {
      const err = validateFile(f, accept, maxSizeMB)
      if (err) bad.push(f.name)
      else valid.push(f)
    }
    setLocalError(bad.length ? `${bad.length} archivo(s) omitidos por tipo o tamaño` : null)
    if (inputRef.current) inputRef.current.value = ''
    if (valid.length) onFiles ? onFiles(valid) : onFile?.(valid[0])
  }

  function handleFiles(files) {
    multiple ? pickMany(files) : pick(files[0])
  }

  const isDraggingPage = usePageDrag({ enabled: fullScreenOverlay, isUploading, onDrop: handleFiles })

  const displayError = localError || error

  return (
    <>
      {fullScreenOverlay && isDraggingPage && createPortal(
        <PageOverlay overlayLabel={overlayLabel} overlayHint={overlayHint} />,
        document.body
      )}

      <div className="space-y-2">
        <div
          onClick={() => !isUploading && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); if (!isUploading) setIsDraggingZone(true) }}
          onDragLeave={() => setIsDraggingZone(false)}
          onDrop={(e) => {
            e.preventDefault()
            setIsDraggingZone(false)
            if (!isUploading) handleFiles(Array.from(e.dataTransfer.files ?? []))
          }}
          className={[
            'flex flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed py-8 px-4 text-center select-none transition-all duration-200',
            isUploading
              ? 'opacity-50 cursor-not-allowed border-border bg-muted/20'
              : isDraggingZone
                ? 'border-primary bg-primary/5 cursor-copy'
                : file
                  ? 'border-primary/40 bg-muted/40 cursor-pointer'
                  : 'border-border bg-muted/20 hover:border-primary/40 hover:bg-muted/40 cursor-pointer',
          ].join(' ')}
        >
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple={multiple}
            onChange={(e) => handleFiles(Array.from(e.target.files ?? []))}
            disabled={isUploading}
            className="sr-only"
          />

          {file ? (
            <>
              <div className="w-11 h-11 rounded-xl bg-muted flex items-center justify-center">
                <FileArchive className="w-5 h-5 text-foreground/70" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{formatBytes(file.size)} &middot; listo para subir</p>
              </div>
              {onClear && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setLocalError(null)
                    if (inputRef.current) inputRef.current.value = ''
                    onClear()
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" /> Cambiar archivo
                </button>
              )}
            </>
          ) : (
            <>
              <div className={cls('w-11 h-11 rounded-xl flex items-center justify-center transition-colors', isDraggingZone ? 'bg-primary/10' : 'bg-muted')}>
                <Upload className={cls('w-5 h-5 transition-colors', isDraggingZone ? 'text-primary' : 'text-muted-foreground')} />
              </div>
              <div>
                <p className="text-sm font-semibold">
                  {isDraggingZone ? dragActiveLabel : emptyLabel}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{emptyHint}</p>
              </div>
            </>
          )}
        </div>

        {displayError && (
          <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
            <X className="w-3 h-3 shrink-0" />
            {displayError}
          </p>
        )}
      </div>
    </>
  )
}

// ─── Compact variant ──────────────────────────────────────────────────────────

function CompactZone({
  onFile, onFiles, multiple = false, accept, maxSizeMB, isUploading, file, onClear,
  emptyLabel, emptyHint, dragActiveLabel, error,
  fullScreenOverlay, overlayLabel, overlayHint,
}) {
  const [isDraggingZone, setIsDraggingZone] = useState(false)
  const [localError, setLocalError] = useState(null)
  const inputRef = useRef(null)

  function pick(f) {
    if (!f) return
    const err = validateFile(f, accept, maxSizeMB)
    if (err) { setLocalError(err); return }
    setLocalError(null)
    if (inputRef.current) inputRef.current.value = ''
    onFile?.(f)
  }

  function pickMany(files) {
    const all = Array.isArray(files) ? files : Array.from(files)
    if (!all.length) return
    const valid = []
    const bad = []
    for (const f of all) {
      const err = validateFile(f, accept, maxSizeMB)
      if (err) bad.push(f.name)
      else valid.push(f)
    }
    setLocalError(bad.length ? `${bad.length} archivo(s) omitidos por tipo o tamaño` : null)
    if (inputRef.current) inputRef.current.value = ''
    if (valid.length) onFiles ? onFiles(valid) : onFile?.(valid[0])
  }

  function handleFiles(files) {
    multiple ? pickMany(files) : pick(files[0])
  }

  const isDraggingPage = usePageDrag({ enabled: fullScreenOverlay, isUploading, onDrop: handleFiles })

  const displayError = localError || error

  return (
    <>
      {fullScreenOverlay && isDraggingPage && createPortal(
        <PageOverlay overlayLabel={overlayLabel} overlayHint={overlayHint} />,
        document.body
      )}

      <div className="space-y-1.5">
        <div
          onClick={() => !isUploading && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); if (!isUploading) setIsDraggingZone(true) }}
          onDragLeave={() => setIsDraggingZone(false)}
          onDrop={(e) => {
            e.preventDefault()
            setIsDraggingZone(false)
            if (!isUploading) handleFiles(Array.from(e.dataTransfer.files ?? []))
          }}
          className={[
            'flex items-center gap-3 rounded-xl border-2 border-dashed px-3.5 py-2.5 select-none transition-all duration-200',
            isUploading
              ? 'opacity-50 cursor-not-allowed border-border bg-muted/20'
              : isDraggingZone
                ? 'border-primary bg-primary/5 cursor-copy'
                : file
                  ? 'border-primary/40 bg-muted/40 cursor-pointer'
                  : 'border-border bg-muted/20 hover:border-primary/40 hover:bg-muted/40 cursor-pointer',
          ].join(' ')}
        >
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple={multiple}
            onChange={(e) => handleFiles(Array.from(e.target.files ?? []))}
            disabled={isUploading}
            className="sr-only"
          />

          {file ? (
            <>
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <FileArchive className="w-4 h-4 text-foreground/70" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
              </div>
              {onClear && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setLocalError(null)
                    if (inputRef.current) inputRef.current.value = ''
                    onClear()
                  }}
                  className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
                  aria-label="Quitar archivo"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </>
          ) : (
            <>
              <div className={cls('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors', isDraggingZone ? 'bg-primary/10' : 'bg-muted')}>
                <Upload className={cls('w-4 h-4 transition-colors', isDraggingZone ? 'text-primary' : 'text-muted-foreground')} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium leading-tight">
                  {isDraggingZone ? dragActiveLabel : emptyLabel}
                </p>
                <p className="text-xs text-muted-foreground leading-tight mt-0.5">{emptyHint}</p>
              </div>
            </>
          )}
        </div>

        {displayError && (
          <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
            <X className="w-3 h-3 shrink-0" />
            {displayError}
          </p>
        )}
      </div>
    </>
  )
}

// ─── Avatar variant ───────────────────────────────────────────────────────────

function AvatarZone({
  onFile, accept, maxSizeMB, isUploading, src,
  emptyLabel, emptyHint, error,
  fullScreenOverlay, overlayLabel, overlayHint,
  className,
}) {
  const [isDraggingZone, setIsDraggingZone] = useState(false)
  const [localError, setLocalError] = useState(null)
  const inputRef = useRef(null)

  function pick(f) {
    if (!f) return
    const err = validateFile(f, accept, maxSizeMB)
    if (err) { setLocalError(err); return }
    setLocalError(null)
    if (inputRef.current) inputRef.current.value = ''
    onFile(f)
  }

  const isDraggingPage = usePageDrag({ enabled: fullScreenOverlay, isUploading, onDrop: (files) => pick(files[0]) })

  const displayError = localError || error

  return (
    <>
      {fullScreenOverlay && isDraggingPage && createPortal(
        <PageOverlay overlayLabel={overlayLabel} overlayHint={overlayHint} />,
        document.body
      )}

      <div className="flex flex-col items-center gap-2">
        <div
          onClick={() => !isUploading && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); if (!isUploading) setIsDraggingZone(true) }}
          onDragLeave={() => setIsDraggingZone(false)}
          onDrop={(e) => {
            e.preventDefault()
            setIsDraggingZone(false)
            if (!isUploading) pick(e.dataTransfer.files?.[0] ?? null)
          }}
          className={cn(
            'relative w-24 h-24 rounded-2xl overflow-hidden select-none transition-all duration-200',
            isUploading ? 'cursor-not-allowed' : 'cursor-pointer',
            isDraggingZone && 'ring-2 ring-primary ring-offset-2',
            className,
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
            disabled={isUploading}
            className="sr-only"
          />

          {src ? (
            <img src={src} alt="Foto" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-muted flex items-center justify-center">
              <User className="w-10 h-10 text-muted-foreground" />
            </div>
          )}

          <div className={cn(
            'absolute inset-0 flex items-center justify-center transition-all duration-200',
            isUploading ? 'bg-black/50' : isDraggingZone ? 'bg-primary/25' : 'bg-black/0 hover:bg-black/40',
          )}>
            {isUploading ? (
              <span className="text-[11px] text-white font-semibold">Subiendo...</span>
            ) : isDraggingZone ? (
              <Upload className="w-6 h-6 text-primary" />
            ) : (
              <Camera className="w-6 h-6 text-white opacity-0 hover:opacity-100 transition-opacity duration-200" />
            )}
          </div>
        </div>

        {(emptyLabel || emptyHint) && (
          <div className="text-center">
            {emptyLabel && <p className="text-xs font-medium text-foreground/70">{emptyLabel}</p>}
            {emptyHint && <p className="text-xs text-muted-foreground">{emptyHint}</p>}
          </div>
        )}

        {displayError && (
          <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5 text-center">
            <X className="w-3 h-3 shrink-0" />
            {displayError}
          </p>
        )}
      </div>
    </>
  )
}

// ─── Public component ─────────────────────────────────────────────────────────

export function DistDropZone({
  variant = 'default',
  // file callbacks
  onFile,
  onFiles,          // (File[]) => void — for multiple=true
  multiple = false, // allow picking/dropping multiple files at once
  // validation
  accept,
  maxSizeMB = 10,
  // full-screen drag overlay
  fullScreenOverlay = false,
  overlayLabel,
  overlayHint,
  // state
  isUploading = false,
  file = null,      // controlled single-file state (default/compact only)
  onClear,
  src,              // current image URL (avatar variant)
  className,        // extra classes on the avatar element (e.g. status ring)
  // labels
  emptyLabel = 'Arrastra tu archivo aqui',
  emptyHint = 'o haz clic para seleccionar',
  dragActiveLabel = 'Suelta el archivo aqui',
  error = null,
}) {
  const shared = {
    onFile, onFiles, multiple, accept, maxSizeMB, isUploading,
    emptyLabel, emptyHint, dragActiveLabel, error,
    fullScreenOverlay, overlayLabel, overlayHint,
  }

  if (variant === 'compact') {
    return <CompactZone {...shared} file={file} onClear={onClear} />
  }
  if (variant === 'avatar') {
    return <AvatarZone {...shared} src={src} className={className} />
  }
  return <DefaultZone {...shared} file={file} onClear={onClear} />
}
