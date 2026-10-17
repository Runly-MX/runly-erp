import { useState } from 'react'
import { Alert, AlertDescription, AlertTitle, cn } from '@runly/ui'
import { AlertTriangle, ChevronDown, Info } from 'lucide-react'
import { CERT_DOCX_REFERENCE, formatInfo } from '../../lib/lmsCert.js'

// Upload / validation warnings of an uploaded template.
export function DocxWarnings({ list = [], title = 'Advertencias de la plantilla' }) {
  if (!list.length) return null
  return (
    <Alert variant="warning" className="rounded-md p-3">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <ul className="list-disc space-y-0.5 pl-4 text-xs">{list.map((w) => <li key={w}>{w}</li>)}</ul>
      </AlertDescription>
    </Alert>
  )
}

// Shown when the instance has no Office (Collabora) to convert Word/PowerPoint to PDF.
export function OfficeNotice({ className }) {
  return (
    <Alert variant="warning" className={cn('rounded-md p-3', className)}>
      <Info className="h-4 w-4" />
      <AlertTitle>Office no está configurado</AlertTitle>
      <AlertDescription className="text-xs">
        Las plantillas de Word y PowerPoint se convierten a PDF con Office. Mientras no esté disponible, los certificados de esas plantillas se generan con el diseño integrado. Las plantillas PDF no necesitan Office.
      </AlertDescription>
    </Alert>
  )
}

// Collapsible list of the tags a Word / PowerPoint certificate can use.
export function CertDocxReference({ format = 'docx' }) {
  const app = format === 'office' ? 'Word y PowerPoint' : formatInfo(format).app
  const where = format === 'pptx' ? 'presentación de PowerPoint' : format === 'office' ? 'archivo de Word o PowerPoint' : 'documento de Word'
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-md border border-[hsl(var(--border))]">
      <button
        type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-sm font-medium"
      >
        Etiquetas disponibles en la plantilla de {app}
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none', open && 'rotate-180')} />
      </button>
      {open ? (
        <div className="border-t border-[hsl(var(--border))] px-3 py-3">
          <p className="mb-3 text-xs text-[hsl(var(--muted-foreground))]">
            Escribe las etiquetas con llaves dobles en tu {where}. Las que empiezan con % se reemplazan por una imagen. Las etiquetas desconocidas se reportan como advertencia al subir la plantilla.
            {format !== 'docx' ? ' En PowerPoint cada imagen va sola en su propio cuadro de texto: la imagen ocupa la posición y el tamaño de ese cuadro.' : ''}
          </p>
          <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
            {CERT_DOCX_REFERENCE.map(([tag, description]) => (
              <div key={tag} className="contents">
                <dt className="break-all font-mono text-xs">{tag}</dt>
                <dd className="text-xs text-[hsl(var(--muted-foreground))]">{description}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  )
}
