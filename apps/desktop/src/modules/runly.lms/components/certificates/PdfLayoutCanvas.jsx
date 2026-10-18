import { useEffect, useMemo, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { ErrorState, Skeleton, cn } from '@runly/ui'
import { Image as ImageIcon, QrCode } from 'lucide-react'
import { FIELD_SAMPLES, fieldLabel, isImageField, moveField, nudge, resizeField } from '../../lib/certLayout.js'

// Same worker setup as @runly/ui PDFViewer (copied to public/ on postinstall).
pdfjs.GlobalWorkerOptions.workerSrc = `${import.meta.env?.BASE_URL || '/'}pdf.worker.min.mjs`

const HANDLES = [
  ['nw', 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize'],
  ['ne', 'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize'],
  ['sw', 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize'],
  ['se', 'bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize'],
]
const ALIGN = { left: 'justify-start text-left', center: 'justify-center text-center', right: 'justify-end text-right' }

function useWidth(ref) {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const node = ref.current
    if (!node) return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref])
  return width
}

function FieldContent({ field, scale }) {
  if (isImageField(field.key)) {
    const Icon = field.key === 'qr' ? QrCode : ImageIcon
    return (
      <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-primary">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate text-[10px] font-medium">{fieldLabel(field.key)}</span>
      </span>
    )
  }
  return (
    <span
      className={cn('flex h-full w-full items-center overflow-hidden whitespace-nowrap px-0.5', ALIGN[field.align] ?? ALIGN.left)}
      style={{ fontSize: Math.max(6, field.fontSize * scale), fontWeight: field.bold ? 700 : 400, color: field.color, fontFamily: 'Helvetica, Arial, sans-serif' }}
    >
      {FIELD_SAMPLES[field.key] ?? fieldLabel(field.key)}
    </span>
  )
}

// First page of the template with draggable / resizable field boxes.
// Coordinates stay in PDF points; `scale` converts to rendered pixels.
export function PdfLayoutCanvas({ file, page, fields, selectedKey, onSelect, onChange, onRemove }) {
  const wrapper = useRef(null)
  const drag = useRef(null)
  const width = useWidth(wrapper)
  const [error, setError] = useState(null)
  const scale = width && page?.width ? width / page.width : 0
  const source = useMemo(() => file, [file])

  function start(event, field, handle = null) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    onSelect(field.key)
    event.currentTarget.setPointerCapture?.(event.pointerId)
    drag.current = { handle, x: event.clientX, y: event.clientY, origin: field }
  }

  function move(event) {
    const d = drag.current
    if (!d || !scale) return
    const dx = (event.clientX - d.x) / scale, dy = (event.clientY - d.y) / scale
    onChange(d.handle ? resizeField(d.origin, d.handle, dx, dy, page) : moveField(d.origin, dx, dy, page))
  }

  function end(event) {
    if (!drag.current) return
    drag.current = null
    try { event.currentTarget.releasePointerCapture?.(event.pointerId) } catch { /* already released */ }
  }

  function keyDown(event, field) {
    const step = nudge(event.key, event.shiftKey)
    if (step) {
      event.preventDefault()
      onChange(moveField(field, step[0], step[1], page))
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      onRemove(field.key)
    }
  }

  if (error) return <ErrorState title="No se pudo mostrar el PDF" description={error.message} showReport={false} />

  return (
    <div ref={wrapper} className="w-full">
      {!file || !scale ? <Skeleton className="w-full rounded-md" style={{ aspectRatio: page ? `${page.width} / ${page.height}` : '11 / 8.5' }} /> : (
        <div
          className="relative select-none overflow-hidden rounded-md border border-[hsl(var(--border))] bg-white"
          style={{ width, height: page.height * scale }}
          onPointerDown={(event) => { if (event.target === event.currentTarget || event.target.tagName === 'CANVAS') onSelect(null) }}
        >
          <Document file={source} onLoadError={setError} loading={null} error={null}>
            <Page pageNumber={1} width={width} renderTextLayer={false} renderAnnotationLayer={false} loading={null} />
          </Document>
          {fields.map((field) => {
            const selected = field.key === selectedKey
            return (
              <div
                key={field.key}
                role="button"
                tabIndex={0}
                aria-label={`${fieldLabel(field.key)}: arrastra para mover, flechas para ajustar`}
                aria-pressed={selected}
                className={cn(
                  'absolute touch-none rounded-sm border outline-none',
                  selected
                    ? 'z-10 cursor-move border-primary bg-primary/16'
                    : 'cursor-pointer border-dashed border-primary/60 bg-primary/5 hover:bg-primary/10 focus-visible:bg-primary/12',
                )}
                style={{ left: field.x * scale, top: field.y * scale, width: field.w * scale, height: field.h * scale, ...(field.background ? { backgroundColor: field.background } : {}) }}
                onPointerDown={(event) => start(event, field)}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={end}
                onFocus={() => onSelect(field.key)}
                onKeyDown={(event) => keyDown(event, field)}
              >
                <FieldContent field={field} scale={scale} />
                <span className="pointer-events-none absolute -top-4 left-0 whitespace-nowrap rounded-sm bg-primary px-1 text-[10px] leading-4 text-primary-foreground">
                  {fieldLabel(field.key)}
                </span>
                {selected ? HANDLES.map(([handle, position]) => (
                  <span
                    key={handle}
                    aria-hidden="true"
                    className={cn('absolute h-2.5 w-2.5 rounded-sm border border-primary bg-white', position)}
                    onPointerDown={(event) => start(event, field, handle)}
                  />
                )) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
