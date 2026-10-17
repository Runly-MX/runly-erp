import { useEffect, useState } from 'react'
import { Alert, AlertDescription, AlertTitle, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Skeleton } from '@runly/ui'
import { AlertTriangle, CheckCircle2, Download, Upload, WandSparkles } from 'lucide-react'
import { toast } from 'sonner'
import { saveSuggestion, useReplaceCertificateTemplateFile, useSuggestCertificateTags } from '../../hooks/useLmsCertDocx.js'
import { docxSuggestionFile, docxTagLabel, docxTagText } from '../../lib/lmsCert.js'

const MISSING_HINT = { '%qr': 'agrega {{%qr}} donde quieras el código de verificación' }

// Places suggested tags in the company's own certificate and lets the author
// download the copy for review or apply it over the same template.
export function CertSuggestDialog({ template, onOpenChange }) {
  const suggest = useSuggestCertificateTags(), replace = useReplaceCertificateTemplateFile()
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!template?.id) { setResult(null); return }
    suggest.mutateAsync(template.id).then(setResult).catch((error) => {
      toast.error(error?.message || 'No se pudieron sugerir etiquetas.')
      onOpenChange(false)
    })
    // Run once per opened template.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id])

  async function apply() {
    try {
      const saved = await replace.mutateAsync({ id: template.id, file: docxSuggestionFile(result) })
      toast.success(saved?.warnings?.length ? 'Etiquetas aplicadas. Revisa las advertencias de la plantilla.' : 'Etiquetas aplicadas a la plantilla.')
      onOpenChange(false)
    } catch { /* toast shown by the mutation */ }
  }

  const applied = result?.applied ?? []
  const missing = result?.missing ?? []
  const unplaced = result?.unplaced ?? []

  return (
    <Dialog open={Boolean(template)} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader icon={WandSparkles}>
          <DialogTitle>Etiquetas sugeridas</DialogTitle>
          <DialogDescription>
            Se colocaron etiquetas en una copia de «{template?.name}». Descárgala para revisarla en Word o aplícala directamente; tu archivo solo se reemplaza si eliges aplicar.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] space-y-3 overflow-y-auto">
          {!result ? (
            <div className="space-y-2" aria-label="Analizando la plantilla">
              <Skeleton className="h-8 w-full rounded-md" /><Skeleton className="h-8 w-full rounded-md" /><Skeleton className="h-8 w-2/3 rounded-md" />
            </div>
          ) : (
            <>
              {applied.length ? (
                <ul className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))] text-sm">
                  {applied.map((item, index) => (
                    <li key={`${item.tag}-${index}`} className="flex items-center justify-between gap-3 px-3 py-1.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <span className="truncate">{item.label || docxTagLabel(item.tag)}</span>
                      </span>
                      <code className="shrink-0 font-mono text-xs text-[hsl(var(--muted-foreground))]">{docxTagText(item.tag)}</code>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm">No se reconoció ningún campo. Escribe las etiquetas a mano en Word con la tabla de referencia.</p>
              )}
              {missing.length ? (
                <Alert variant="warning" className="rounded-md p-3">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>No se encontró dónde poner</AlertTitle>
                  <AlertDescription className="text-xs">
                    {missing.map((tag) => (MISSING_HINT[tag] ? `${docxTagLabel(tag)} (${MISSING_HINT[tag]})` : docxTagLabel(tag))).join(', ')}. Agrégalas a mano en Word si tu formato las necesita.
                  </AlertDescription>
                </Alert>
              ) : null}
              {unplaced.length ? (
                <div className="space-y-1 rounded-md border border-[hsl(var(--border))] px-3 py-2 text-xs">
                  <p className="font-medium">Campos que no se reconocieron</p>
                  <ul className="list-disc space-y-0.5 pl-4 text-[hsl(var(--muted-foreground))]">{unplaced.map((text) => <li key={text}>{text}</li>)}</ul>
                </div>
              ) : null}
            </>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => saveSuggestion(result)} disabled={!result || !applied.length}>
            <Download />Descargar para revisar
          </Button>
          <Button type="button" onClick={apply} disabled={!result || !applied.length || replace.isPending}>
            <Upload />{replace.isPending ? 'Aplicando…' : 'Aplicar a la plantilla'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
