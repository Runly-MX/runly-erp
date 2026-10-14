import { useEffect, useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@runly/ui'
import { AlertTriangle, CheckCircle2, Download, Upload, WandSparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useReplaceDocumentTemplateFile, useSuggestTemplateTags } from '../../hooks/useInventoryCustody.js'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const TAG_LABELS = {
  date: 'Fecha', folio: 'Folio', receiverName: 'Nombre del colaborador', receiverEmployeeNumber: 'Número de empleado',
  receiverDepartment: 'Departamento', receiverJobTitle: 'Puesto', receiverEmail: 'Correo', comments: 'Comentarios',
  typeBrand: 'Tipo / marca', model: 'Modelo', serialNumber: 'Serie', assetNumber: 'Número de activo', invoiceNumber: 'Factura',
  features: 'Características', index: 'Número de renglón', '#items': 'Fila de equipos (se repite por artículo)',
  receiverSignature: 'Firma de quien recibe', delivererSignature: 'Firma de quien entrega',
}
const tagText = (tag) => (tag.startsWith('#') ? '{{#items}} … {{/items}}' : /Signature$/.test(tag) ? `{{%${tag}}}` : `{{${tag}}}`)

function toFile(result) {
  const bytes = Uint8Array.from(atob(result.contentBase64), (ch) => ch.charCodeAt(0))
  return new File([bytes], result.fileName, { type: DOCX_MIME })
}

// Places suggested tags in the company's own blank form and lets the user
// download it for review or apply it over the same template.
export function TemplateSuggestDialog({ template, onOpenChange }) {
  const suggest = useSuggestTemplateTags()
  const replace = useReplaceDocumentTemplateFile()
  const [result, setResult] = useState(null)
  const open = Boolean(template)

  useEffect(() => {
    if (!template) { setResult(null); return }
    suggest.mutateAsync(template.id).then(setResult).catch((err) => {
      toast.error(err?.message ?? 'No se pudieron sugerir etiquetas')
      onOpenChange(false)
    })
    // Run once per opened template.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id])

  function download() {
    const url = URL.createObjectURL(toFile(result))
    const a = document.createElement('a')
    a.href = url
    a.download = result.fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }

  async function apply() {
    try {
      await replace.mutateAsync({ id: template.id, file: toFile(result) })
      toast.success('Etiquetas aplicadas a la plantilla')
      onOpenChange(false)
    } catch (err) { toast.error(err?.message ?? 'No se pudo aplicar la plantilla') }
  }

  const applied = result?.applied ?? []
  const missing = result?.missing ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary))]/12 text-[hsl(var(--primary))]" aria-hidden="true"><WandSparkles className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1 space-y-1.5">
          <DialogTitle>Etiquetas sugeridas</DialogTitle>
          <DialogDescription>
            Se colocaron las etiquetas en tu propio formato «{template?.name}». Descárgalo para revisarlo en Word o aplícalo directamente; tu archivo original solo se reemplaza si eliges aplicar.
          </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="max-h-[50vh] space-y-3 overflow-y-auto">
          {suggest.isPending || !result ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Analizando la plantilla...</p>
          ) : (
            <>
              {applied.length ? (
                <ul className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))] text-sm">
                  {applied.map((a, i) => (
                    <li key={`${a.tag}-${i}`} className="flex items-center justify-between gap-3 px-3 py-1.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <span className="truncate">{a.label || TAG_LABELS[a.tag] || a.tag}</span>
                      </span>
                      <code className="shrink-0 font-mono text-xs text-[hsl(var(--muted-foreground))]">{tagText(a.tag)}</code>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm">No se reconoció ningún campo en el formato. Escribe las etiquetas a mano en Word con la tabla de referencia.</p>
              )}
              {missing.length ? (
                <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
                  <p className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400"><AlertTriangle className="h-3.5 w-3.5" />No se encontró dónde poner</p>
                  <p className="text-[hsl(var(--muted-foreground))]">{missing.map((tag) => TAG_LABELS[tag] ?? tag).join(', ')}. Agrégalas a mano en Word si tu formato las necesita.</p>
                </div>
              ) : null}
            </>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={download} disabled={!result || !applied.length}>
            <Download className="mr-1.5 h-3.5 w-3.5" />Descargar para revisar
          </Button>
          <Button type="button" onClick={apply} disabled={!result || !applied.length || replace.isPending}>
            <Upload className="mr-1.5 h-3.5 w-3.5" />{replace.isPending ? 'Aplicando...' : 'Aplicar a la plantilla'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
