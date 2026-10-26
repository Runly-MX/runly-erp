import { useEffect, useState } from 'react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  ErrorState, Skeleton, Textarea } from '@runly/ui'
import { Check, Copy, Download, ExternalLink, FileBadge, Image as ImageIcon, Shapes, Type } from 'lucide-react'
import { runly } from '../../../lib/runly.js'
import { creditsText } from '../../../../../shared/studio/licenses.js'

const KIND = { iconify: { label: 'Icono', icon: Shapes }, openverse: { label: 'Foto', icon: ImageIcon }, font: { label: 'Fuente', icon: Type } }

function ResourceRow({ row }) {
  const kind = KIND[row.provider] ?? { label: 'Recurso', icon: FileBadge }, Icon = kind.icon
  return (
    <li className="flex gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"><Icon className="h-4 w-4" aria-hidden /></span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-sm font-semibold">{row.title}<span className="ml-1.5 font-normal text-[hsl(var(--muted-foreground))]">· {kind.label}</span></p>
        <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{row.author || 'Autor no indicado'}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-xs">
          {row.licenseUrl ? <a href={row.licenseUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-700 hover:underline dark:text-emerald-300">
            {row.license}<ExternalLink className="h-3 w-3" aria-hidden />
          </a> : <span className="text-amber-700 dark:text-amber-300">{row.license}</span>}
          {row.sourceUrl ? <a href={row.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:underline">Origen<ExternalLink className="h-3 w-3" aria-hidden /></a> : null}
          {row.attributionRequired ? <span className="text-amber-700 dark:text-amber-300">Pide atribución</span> : null}
        </div>
      </div>
    </li>
  )
}

export function StudioCredits({ id, token, scene, action, onClose, onContinue }) {
  const [rows, setRows] = useState(null), [error, setError] = useState(''), [copied, setCopied] = useState(false), [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setRows(null); setError('')
    runly.studio.credits(id, scene, token).then(response => { if (active) setRows([...new Map((response.data ?? []).filter(Boolean).map(row => [`${row.provider}:${row.id}`, row])).values()]) })
      .catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [id, token, scene, retry])
  const text = rows === null ? null : (creditsText(rows) || 'Este diseño no utiliza recursos de catálogos externos.')
  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
    Object.assign(document.createElement('a'), { href: url, download: 'studio-creditos.txt' }).click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { setError('No se pudo copiar. Puedes descargar los créditos.') }
  }
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent size="lg">
        <DialogHeader icon={FileBadge}>
          <DialogTitle>Créditos del diseño</DialogTitle>
          <DialogDescription>Recursos externos que usa tu composición y sus licencias.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          {error ? <ErrorState title="No se pudieron comprobar los créditos" description={error} onRetry={() => setRetry(value => value + 1)} showReport={false} /> : null}
          {!error && rows === null ? <div className="space-y-2" aria-busy="true" aria-label="Comprobando recursos">{[0, 1].map(key => <Skeleton key={key} className="h-[76px] rounded-xl" />)}</div> : null}
          {!error && rows?.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-200">
              <Check className="h-5 w-5 shrink-0" aria-hidden />Este diseño no usa recursos externos: no necesitas incluir créditos.
            </div>
          ) : null}
          {!error && rows?.length ? (
            <>
              <ul className="space-y-2">{rows.map(row => <ResourceRow key={`${row.provider}:${row.id}`} row={row} />)}</ul>
              <Accordion type="single" collapsible>
                <AccordionItem value="text" className="border-none">
                  <AccordionTrigger className="py-2 text-sm">Ver texto completo para publicar</AccordionTrigger>
                  <AccordionContent>
                    <Textarea aria-label="Créditos para publicar" readOnly rows={8} value={text} className="font-mono text-xs leading-relaxed" />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </>
          ) : null}
        </div>
        <DialogFooter className="gap-2 border-t border-[hsl(var(--border))] pt-4 sm:justify-between">
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" disabled={!rows?.length} onClick={copy}>{copied ? <Check /> : <Copy />}{copied ? 'Copiados' : 'Copiar'}</Button>
            <Button variant="ghost" size="sm" disabled={!rows?.length} onClick={download}><Download />Descargar .txt</Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cerrar</Button>
            {action ? <Button disabled={text === null} onClick={onContinue}>{action.kind === 'share' ? 'Continuar a compartir' : `Exportar ${action.format.toUpperCase()}`}</Button> : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
