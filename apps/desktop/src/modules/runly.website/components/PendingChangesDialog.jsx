import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, StatusPill } from '@runly/ui'
import { EyeOff, FilePlus2, FileText, FileX2, Images, ListTree, Newspaper, Palette, PencilLine, Rocket, Settings } from 'lucide-react'
import { editorPath, sitePath } from '../lib/pageRoute.js'
import { useUnpublishPages } from '../hooks/useUnpublishPages.js'
import { CapabilityButton } from './CapabilityButton.jsx'
import { ROW_CARD, SiteIconChip } from './SitePanel.jsx'

const PAGE_FIELDS = { document: 'contenido', seo: 'SEO', title: 'título', slug: 'dirección', path: 'ruta', visibility: 'visibilidad' }
const IDENTITY_FIELDS = { name: 'nombre', siteType: 'tipo de sitio', settings: 'ajustes (logo, contacto, redes)', seoDefaults: 'SEO general' }
const VISIBILITY = { public: 'pública', authenticated: 'solo con sesión', private: 'privada' }
const list = (keys, labels) => keys.map((key) => labels[key] ?? key).join(', ')

function pageLine(change) {
  if (change.isNew) return change.visibility === 'public' ? 'Página nueva: aún no está en tu sitio. Se publicará con Publicar.' : `Página nueva (${VISIBILITY[change.visibility] ?? change.visibility}): no se publicará mientras no sea pública.`
  if (change.visibility && change.visibility !== 'public') return `La cambiaste a ${VISIBILITY[change.visibility] ?? change.visibility}: sigue visible hasta que publiques o la retires.`
  return change.fields?.length ? `Cambió: ${list(change.fields, PAGE_FIELDS)}. Tu sitio muestra la versión anterior.` : 'Tiene cambios que tu sitio todavía no muestra.'
}

function Row({ icon, tone, title, detail, children }) {
  return (
    <li className={`${ROW_CARD} flex flex-wrap items-center gap-3`}>
      <SiteIconChip icon={icon} tone={tone} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{detail}</p>
      </div>
      {children}
    </li>
  )
}

// Everything the draft has that the public site does not, with a way to act on each item.
export function PendingChangesDialog({ open, onOpenChange, site, caps, onPublish }) {
  const navigate = useNavigate()
  const changes = site?.changes ?? []
  const [confirmIds, setConfirmIds] = useState(null)
  const unpublish = useUnpublishPages(site?.id, { onDone: () => setConfirmIds(null) })
  const go = (path) => { onOpenChange(false); navigate(path) }
  const removed = changes.filter((change) => change.kind === 'removedPage' && change.id)
  const pages = changes.filter((change) => change.kind === 'page')

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!unpublish.isPending) onOpenChange(next) }}>
      <DialogContent size="lg" className="flex max-h-[85dvh] flex-col">
        <DialogHeader icon={PencilLine}>
          <DialogTitle>Cambios sin publicar</DialogTitle>
          <DialogDescription>Esto es lo que tu borrador tiene distinto de lo que ven tus visitantes. Nada de esto se ve hasta que publiques.</DialogDescription>
        </DialogHeader>
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {removed.length > 0 && (
            <Row icon={FileX2} tone="rose" title={removed.length === 1 ? `Página borrada: ${removed[0].title}` : `${removed.length} páginas borradas`}
              detail={`${removed.map((change) => `${change.title} (${change.path})`).join(', ')}. Ya no está en tu borrador ni en la lista de páginas, pero los visitantes la siguen viendo.`}>
              {confirmIds
                ? <Button size="sm" variant="destructive" disabled={unpublish.isPending} onClick={() => unpublish.mutate(confirmIds)}>{unpublish.isPending ? 'Retirando…' : 'Confirmar'}</Button>
                : <CapabilityButton capability={caps?.publish} size="sm" variant="outline" onClick={() => setConfirmIds(removed.map((change) => change.id))}><EyeOff className="h-4 w-4" aria-hidden /> Retirar ahora</CapabilityButton>}
            </Row>
          )}
          {changes.some((change) => change.kind === 'removedPage' && !change.id) && <Row icon={FileX2} tone="rose" title="Páginas borradas" detail="Siguen en tu sitio público hasta que publiques." />}
          {pages.map((change) => (
            <Row key={change.id} icon={change.isNew ? FilePlus2 : FileText} tone="blue" title={<>{change.title} <code className="ml-1 text-xs text-[hsl(var(--muted-foreground))]">{change.path}</code> {change.isNew && <StatusPill tone="neutral" size="sm">Nueva</StatusPill>}</>} detail={pageLine(change)}>
              <Button size="sm" variant="outline" onClick={() => go(editorPath(site.id, change.id))}>Editar</Button>
            </Row>
          ))}
          {changes.map((change) => {
            if (change.kind === 'identity') return <Row key="identity" icon={Settings} tone="amber" title="Datos del sitio" detail={change.fields?.length ? `Cambió: ${list(change.fields, IDENTITY_FIELDS)}.` : 'Cambiaron los datos generales del sitio.'}><Button size="sm" variant="outline" onClick={() => go(sitePath(site.id, 'settings'))}>Ver</Button></Row>
            if (change.kind === 'theme') return <Row key="theme" icon={Palette} tone="violet" title="Tema" detail={`${change.name ? `Tema elegido: ${change.name}. ` : ''}Colores o tipografía distintos de los publicados.`}><Button size="sm" variant="outline" onClick={() => go(sitePath(site.id, 'appearance'))}>Ver</Button></Row>
            if (change.kind === 'menus') return <Row key="menus" icon={ListTree} tone="emerald" title="Menús" detail="Enlaces de navegación distintos de los publicados."><Button size="sm" variant="outline" onClick={() => go(sitePath(site.id, 'appearance'))}>Ver</Button></Row>
            if (change.kind === 'posts') return <Row key="posts" icon={Newspaper} tone="amber" title="Blog" detail="Hay entradas nuevas, editadas o borradas."><Button size="sm" variant="outline" onClick={() => go(sitePath(site.id, 'blog'))}>Ver</Button></Row>
            if (change.kind === 'files') return <Row key="files" icon={Images} tone="blue" title="Imágenes" detail="Una imagen usada en el sitio cambió o se borró desde Archivos." />
            return null
          })}
        </ul>
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={unpublish.isPending}>Cerrar</Button>
          <CapabilityButton capability={caps?.publish} onClick={() => { onOpenChange(false); onPublish?.() }} disabled={unpublish.isPending}><Rocket className="h-4 w-4" aria-hidden /> Publicar todo</CapabilityButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
