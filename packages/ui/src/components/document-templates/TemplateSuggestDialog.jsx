import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Download, Upload, WandSparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../Button.jsx'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../Dialog.jsx'
import { TemplateFieldReference } from './TemplateFieldReference.jsx'
import { FORMAT_MIME, base64ToFile, errorText, saveBlob } from './template-utils.js'

// Places suggested tags in the user's own form (Word, Excel or PowerPoint; PDF
// shows its detected fields). Nothing is saved until "Aplicar": the original
// file stays as it was otherwise. `onSkip` continues to the field review.
export function TemplateSuggestDialog({ template, api, kind, onOpenChange, onApplied, onSkip }) {
  const schema = kind?.schema
  const isPdf = template?.format === 'pdf'
  const [result, setResult] = useState(null)
  const suggest = useMutation({ mutationFn: () => api.suggestTemplate(template.id, template.version.id) })
  const apply = useMutation({
    mutationFn: (file) => api.replaceTemplateFile(template.id, template.version.id, file),
    onSuccess: (response) => {
      toast.success('Etiquetas aplicadas. Revisa el mapeo y publica la plantilla.')
      onApplied?.(response)
    },
    onError: (error) => toast.error(errorText(error, 'No se pudo aplicar la plantilla')),
  })

  useEffect(() => {
    setResult(null)
    if (!template) return
    suggest.mutateAsync().then(setResult).catch((error) => {
      toast.error(errorText(error, 'No se pudieron sugerir etiquetas'))
      onOpenChange(false)
    })
    // Run once per opened template.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id])

  const label = (tag) => schema?.find((entry) => entry.tag === tag)?.label ?? tag
  const applied = result?.applied ?? []
  const missing = result?.missing ?? []
  const file = result?.contentBase64 ? base64ToFile(result.contentBase64, result.fileName, FORMAT_MIME[result.format]) : null

  return (
    <Dialog open={Boolean(template)} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader icon={WandSparkles}>
          <DialogTitle>Etiquetas sugeridas</DialogTitle>
          <DialogDescription>
            Tu formato «{template?.name}» no tiene etiquetas {'{{campo}}'}; estas son las que se proponen. Descárgalo para revisarlo o aplícalas; tu archivo solo cambia si eliges aplicar.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] space-y-3 overflow-y-auto">
          {!result ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Analizando la plantilla...</p>
          ) : result.supported === false ? (
            <p className="text-sm">{result.message}</p>
          ) : (
            <>
              {applied.length ? (
                <ul className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))] text-sm">
                  {applied.map((a, i) => (
                    <li key={`${a.tag}-${i}`} className="flex items-center justify-between gap-3 px-3 py-1.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <span className="truncate">{a.label || label(a.tag)}</span>
                      </span>
                      <code className="shrink-0 font-mono text-xs text-[hsl(var(--muted-foreground))]">{`{{${a.tag}}}`}</code>
                    </li>
                  ))}
                </ul>
              ) : result.format === 'pdf' && result.layout?.fields?.length ? (
                <div className="space-y-2 text-sm">
                  <p>Campos detectados en el PDF: {result.layout.fields.map((f) => label(f.key)).join(', ')}.</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">Ya están en la plantilla; ajústalos y publícalos desde «Campos».</p>
                </div>
              ) : isPdf || result.format === 'pdf' ? (
                <div className="space-y-2 text-sm">
                  <p>No se detectaron campos en el PDF.</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    Word es el formato recomendado para colocar las etiquetas automáticamente: sube tu formato como .docx.
                    En un PDF se reconocen etiquetas de texto como «Nombre:» seguidas de un espacio en blanco, o marcas como [Campo] escritas en el documento.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 text-sm">
                  <p>No se reconoció ningún campo en el formato. Etiqueta manualmente con {'{{campo}}'}.</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    Se buscan títulos como «Nombre del empleado» o «Fecha» seguidos de una celda o cuadro vacío, o de una línea de guiones bajos (____). Revisa que los títulos estén escritos como texto y no como imagen, o copia las etiquetas de la lista y escríbelas en tu documento.
                  </p>
                  <TemplateFieldReference kind={kind} defaultOpen />
                </div>
              )}
              {missing.length ? (
                <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
                  <p className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" />No se encontró dónde poner
                  </p>
                  <p className="text-[hsl(var(--muted-foreground))]">{missing.map(label).join(', ')}. Agrégalas a mano si tu formato las necesita.</p>
                </div>
              ) : null}
            </>
          )}
        </div>
        <DialogFooter>
          {onSkip ? <Button type="button" variant="ghost" onClick={onSkip}>Revisar campos sin aplicar</Button> : null}
          <Button type="button" variant="outline" onClick={() => file && saveBlob(file, file.name)} disabled={!file || !applied.length}>
            <Download className="mr-1.5 h-3.5 w-3.5" />Descargar para revisar
          </Button>
          <Button type="button" onClick={() => apply.mutate(file)} disabled={!file || !applied.length || apply.isPending}>
            <Upload className="mr-1.5 h-3.5 w-3.5" />{apply.isPending ? 'Aplicando...' : 'Aplicar a la plantilla'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
