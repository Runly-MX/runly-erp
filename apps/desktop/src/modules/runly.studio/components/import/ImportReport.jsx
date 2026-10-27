import { Alert, AlertDescription, AlertTitle, Badge, cn } from '@runly/ui'
import { AlertTriangle, Check, FileWarning, ImageOff, Info, Layers, Type, XCircle } from 'lucide-react'
import { StudioThumbnail } from '../StudioThumbnail.jsx'
import { previewDocument } from '../../lib/studio-import.js'

const TONE_ICON = { success: Check, warning: AlertTriangle, destructive: XCircle }
const REDISTRIBUTION = { allowed: 'Redistribución permitida', unknown: 'Derechos sin verificar', forbidden: 'Redistribución prohibida' }

function Section({ icon: Icon, title, count, children }) {
  return (
    <section aria-label={title} className="space-y-1.5">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
        <Icon className="h-3.5 w-3.5" aria-hidden />{title}{count != null ? <span className="font-normal tabular-nums">({count})</span> : null}
      </h3>
      {children}
    </section>
  )
}

// Where a loss applies: the engine names a page in its message when it can; otherwise the whole file.
const scopeLabel = row => (row.page ? `Página ${row.page}` : 'Todo el archivo')

// Fidelity banner: the level is derived from the engine report, never from the file name.
export function FidelityBanner({ assess }) {
  const Icon = TONE_ICON[assess.tone] ?? Info
  const problems = assess.cannotImport ? assess.blockers : assess.losses
  return (
    <Alert variant={assess.tone} role="status" data-fidelity={assess.level}>
      <Icon className="h-4 w-4" aria-hidden />
      <div>
        <AlertTitle>{assess.label}</AlertTitle>
        <AlertDescription>
          <p>{assess.description}</p>
          {problems.length ? (
            <ul className="mt-2 space-y-1.5" aria-label={assess.cannotImport ? 'Problemas que impiden importar' : 'Elementos que cambian'}>
              {problems.map((row, index) => (
                <li key={`${index}-${row.text}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                  <Badge variant="outline" className="shrink-0">{row.kind === 'raster' ? 'Se convierte en imagen' : scopeLabel(row)}</Badge>
                  <span className="min-w-0 break-words">{row.text}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </AlertDescription>
      </div>
    </Alert>
  )
}

const dims = page => `${Math.round(page.width)} × ${Math.round(page.height)} px`

export function ImportReport({ report, assess, images, pending }) {
  const pages = report.pages ?? [], resources = report.resources ?? [], fonts = report.fonts ?? [], notices = report.notices ?? []
  const document = previewDocument(report.preview), first = pages[0]
  // A file the engine could not read has no pages to preview: show why, and any font that blocks it.
  if (!pages.length) return (
    <div className="space-y-4">
      <FidelityBanner assess={assess} />
      {fonts.length ? <Section icon={Type} title="Fuentes" count={fonts.length}><ul className="flex flex-wrap gap-1.5">{fonts.map(font => <li key={`${font.family}:${font.variant}`}><Badge variant={font.available ? 'secondary' : 'destructive'}>{font.family} · {font.variant}{font.available ? '' : ' (no disponible)'}</Badge></li>)}</ul></Section> : null}
    </div>
  )
  return (
    <div className="space-y-4">
      <FidelityBanner assess={assess} />
      <div className="grid gap-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <figure className="space-y-1.5">
          <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)] p-3">
            {document ? <StudioThumbnail document={document} images={images} /> : <ImageOff className="h-6 w-6 text-[hsl(var(--muted-foreground))]" aria-label="Sin vista previa" />}
          </div>
          <figcaption className="text-xs text-[hsl(var(--muted-foreground))]">
            Primera página, tal como la dibuja Studio. {pending ? 'Las imágenes aparecen al preparar la importación.' : 'Vista orientativa de hasta 40 objetos.'}
          </figcaption>
        </figure>
        <div className="min-w-0 space-y-4">
          <dl className="grid grid-cols-3 gap-2 text-sm">
            {[['Páginas', pages.length], ['Imágenes', resources.length], ['Fuentes', fonts.length]].map(([term, value]) => (
              <div key={term} className="rounded-lg bg-[hsl(var(--muted)/0.5)] px-3 py-2"><dt className="text-xs text-[hsl(var(--muted-foreground))]">{term}</dt><dd className="text-base font-semibold tabular-nums">{value}</dd></div>
            ))}
          </dl>
          {first ? <p className="text-sm text-[hsl(var(--muted-foreground))]">Tamaño{pages.length > 1 ? ' de la primera página' : ''}: <span className="font-medium text-[hsl(var(--foreground))] tabular-nums">{dims(first)}</span></p> : null}
          {pages.length ? (
            <Section icon={Layers} title="Páginas" count={pages.length}>
              <ul tabIndex={0} aria-label="Páginas del archivo" className="max-h-28 space-y-0.5 overflow-y-auto text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
                {pages.map((page, index) => (
                  <li key={page.id ?? index} className="flex justify-between gap-3"><span>Página {index + 1}</span><span className="tabular-nums text-[hsl(var(--muted-foreground))]">{dims(page)} · {page.objectCount} {page.objectCount === 1 ? 'objeto' : 'objetos'}</span></li>
                ))}
              </ul>
            </Section>
          ) : null}
          {fonts.length ? (
            <Section icon={Type} title="Fuentes" count={fonts.length}>
              <ul className="flex flex-wrap gap-1.5">
                {fonts.map(font => <li key={`${font.family}:${font.variant}`}><Badge variant={font.available ? 'secondary' : 'destructive'}>{font.family} · {font.variant}{font.available ? '' : ' (no disponible)'}</Badge></li>)}
              </ul>
            </Section>
          ) : null}
        </div>
      </div>
      {resources.length ? (
        <Section icon={FileWarning} title="Imágenes incluidas" count={resources.length}>
          <ul tabIndex={0} aria-label="Imágenes y su licencia" className="max-h-32 space-y-1 overflow-y-auto text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
            {resources.map((resource, index) => (
              <li key={resource.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span>Imagen {index + 1} · <span className="tabular-nums text-[hsl(var(--muted-foreground))]">{resource.width} × {resource.height} px</span></span>
                <span className={cn('text-xs', resource.license?.redistribution === 'allowed' ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300')}>
                  {resource.license?.id && resource.license.id !== 'unspecified' ? `${resource.license.id} · ` : ''}{REDISTRIBUTION[resource.license?.redistribution] ?? 'Derechos sin verificar'}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {assess.licenseNotice || notices.length ? (
        <Alert variant="default" role="note">
          <Info className="h-4 w-4" aria-hidden />
          <div>
            <AlertTitle>Licencias declaradas, no verificadas</AlertTitle>
            <AlertDescription>
              <p>Autor y licencia son datos del archivo: Studio no los comprueba. Confirma que puedes usar y compartir este contenido.</p>
              {notices.length ? <ul className="mt-1.5 space-y-0.5 text-xs">{notices.map((notice, index) => <li key={`${notice.subject}-${index}`} className="break-words">{[notice.license?.id, notice.license?.author].filter(Boolean).join(' · ') || 'Sin datos de licencia'}</li>)}</ul> : null}
            </AlertDescription>
          </div>
        </Alert>
      ) : null}
    </div>
  )
}
