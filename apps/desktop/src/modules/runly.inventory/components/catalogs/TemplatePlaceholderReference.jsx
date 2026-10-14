import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@runly/ui'

// Placeholder contract of custody templates (spec 2026-10-13 §4).
const ROWS = [
  ['{{folio}}', 'Folio del resguardo (RES-2026-0001)'],
  ['{{date}}', 'Fecha del resguardo (dd/mm/aaaa)'],
  ['{{kind}}', 'Tipo: Entrega o Devolución'],
  ['{{receiverName}}', 'Nombre del colaborador que recibe'],
  ['{{receiverEmployeeNumber}}', 'Número de empleado'],
  ['{{receiverDepartment}}', 'Departamento'],
  ['{{receiverJobTitle}}', 'Puesto'],
  ['{{receiverEmail}}', 'Correo del colaborador'],
  ['{{delivererName}}', 'Quién entrega'],
  ['{{comments}}', 'Comentarios del resguardo'],
  ['{{#items}} … {{/items}}', 'Repite la fila por cada artículo. En Excel, la fila que contiene {{#items}} es la plantilla de fila.'],
  ['{{index}}', 'Número de renglón (dentro de items)'],
  ['{{typeBrand}}', 'Tipo y marca (dentro de items)'],
  ['{{model}}', 'Modelo (dentro de items)'],
  ['{{serialNumber}}', 'Número de serie (dentro de items)'],
  ['{{assetNumber}}', 'Etiqueta o número de activo (dentro de items)'],
  ['{{invoiceNumber}}', 'Factura (dentro de items)'],
  ['{{features}}', 'Características (dentro de items)'],
  ['{{%receiverSignature}}', 'Imagen de la firma de quien recibe (220 × 88 px)'],
  ['{{%delivererSignature}}', 'Imagen de la firma de quien entrega (220 × 88 px)'],
  ['{{company.name}}', 'Nombre comercial de la empresa'],
  ['{{company.legalName}}', 'Razón social'],
  ['{{company.taxId}}', 'RFC / identificación fiscal'],
]

export function TemplatePlaceholderReference() {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-md border border-[hsl(var(--border))]">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium">
        Etiquetas disponibles en la plantilla
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <div className="border-t border-[hsl(var(--border))] px-3 py-3">
          <p className="mb-3 text-xs text-[hsl(var(--muted-foreground))]">
            Escribe las etiquetas con llaves dobles en tu documento de Word o Excel. Las etiquetas desconocidas se reportan como advertencia al subir la plantilla.
          </p>
          <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
            {ROWS.map(([tag, description]) => (
              <div key={tag} className="contents">
                <dt className="font-mono text-xs text-[hsl(var(--foreground))] break-all">{tag}</dt>
                <dd className="text-xs text-[hsl(var(--muted-foreground))]">{description}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  )
}
