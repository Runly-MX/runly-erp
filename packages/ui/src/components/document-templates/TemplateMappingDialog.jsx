import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Eye, Link2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../Button.jsx'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../Dialog.jsx'
import { ComboboxField } from '../FormFields.jsx'
import { errorText, schemaOptions, unknownTags } from './template-utils.js'

// Review step of a template version: map unknown tags to data fields, confirm
// the detected PDF boxes, then save or publish. Published versions are
// read-only here (replacing the file creates a new draft).
export function TemplateMappingDialog({ template, warnings = [], kind, api, onOpenChange, onChanged, onPreview }) {
  const version = template?.version
  const readOnly = version?.status === 'published'
  const [mapping, setMapping] = useState({})
  const [fields, setFields] = useState([])

  useEffect(() => {
    setMapping(version?.mapping ?? {})
    setFields(version?.layout?.fields ?? [])
  }, [template?.id, version?.id, version?.mapping, version?.layout])

  const isPdf = template?.format === 'pdf'
  const keys = useMemo(() => (isPdf ? fields.map((f) => f.key) : version?.placeholders ?? []), [isPdf, fields, version?.placeholders])
  const unknown = useMemo(() => unknownTags(kind, keys), [kind, keys])
  const known = keys.length - unknown.length

  const save = useMutation({
    mutationFn: async ({ publish }) => {
      const payload = { mapping: Object.fromEntries(Object.entries(mapping).filter(([tag, path]) => keys.includes(tag) && path)) }
      if (isPdf) payload.layout = { ...(version.layout ?? {}), fields }
      let saved = await api.saveTemplateMapping(template.id, version.id, payload)
      if (publish) saved = (await api.publishFileTemplate(template.id, version.id)).template
      return saved
    },
    onSuccess: (saved, { publish }) => {
      toast.success(publish ? 'Plantilla publicada' : 'Mapeo guardado')
      onChanged?.(saved)
      if (publish) onOpenChange(false)
    },
    onError: (error) => toast.error(errorText(error, 'No se pudo guardar la plantilla')),
  })

  // Drafts are tried out too: the current mapping is saved first so the preview matches the screen.
  async function testSample() {
    let current = template
    if (!readOnly) {
      try { current = await save.mutateAsync({ publish: false }) } catch { return }
    }
    onPreview?.(current)
  }

  const optionsFor = (tag) => {
    const dot = tag.indexOf('.')
    return schemaOptions(kind, dot === -1 ? null : tag.slice(0, dot))
  }

  return (
    <Dialog open={Boolean(template)} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader icon={Link2}>
          <DialogTitle>Campos de «{template?.name}»</DialogTitle>
          <DialogDescription>
            {readOnly
              ? 'Esta versión ya está publicada. Para cambiar los campos, reemplaza el archivo y se creará una versión nueva.'
              : 'Confirma qué dato va en cada campo y publica la plantilla para usarla al generar documentos.'}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] space-y-4 overflow-y-auto">
          {warnings.length ? (
            <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
              <p className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />Advertencias de la plantilla
              </p>
              <ul className="list-disc space-y-0.5 pl-5 text-[hsl(var(--muted-foreground))]">
                {warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            </div>
          ) : null}

          {isPdf ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Campos detectados en el PDF ({fields.length})</p>
              {fields.length ? (
                <ul className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))] text-sm">
                  {fields.map((field) => (
                    <li key={field.key} className="flex items-center justify-between gap-3 px-3 py-1.5">
                      <span className="min-w-0 truncate">{kind?.schema?.find((e) => e.tag === field.key)?.label ?? field.key}</span>
                      <span className="flex shrink-0 items-center gap-3 text-xs text-[hsl(var(--muted-foreground))]">
                        <span className="tabular-nums">x {Math.round(field.x)}, y {Math.round(field.y)}, {Math.round(field.w)} x {Math.round(field.h)}</span>
                        {!readOnly ? (
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Quitar ${field.key}`}
                            onClick={() => setFields((list) => list.filter((f) => f.key !== field.key))}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">No se detectaron campos. Usa un PDF con etiquetas de texto como «Nombre:» o marcas [Campo]. Con un archivo de Word las etiquetas se colocan solas y es la opción recomendada.</p>
              )}
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              {kind?.freeTags
                ? `${keys.length} campos libres: se llenan con los valores que envíe quien genere el documento`
                : `${known} de ${keys.length} campos coinciden con los datos de «${kind?.label}»`}
            </p>
            {unknown.length ? (
              <div className="space-y-2 rounded-md border border-[hsl(var(--border))] p-3">
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Estas etiquetas no existen en los datos. Elige de dónde tomar su valor o déjalas vacías.</p>
                {unknown.map((tag) => (
                  <div key={tag} className="grid items-center gap-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
                    <code className="break-all font-mono text-xs">{`{{${tag}}}`}</code>
                    <ComboboxField options={optionsFor(tag)} value={mapping[tag] ?? ''} disabled={readOnly}
                      placeholder="Elegir campo..." onChange={(value) => setMapping((m) => ({ ...m, [tag]: value }))} />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <DialogFooter className="sm:flex-wrap sm:justify-between">
          <Button type="button" variant="ghost" className="justify-start" disabled={!onPreview || save.isPending}
            title={readOnly ? undefined : 'Prueba el borrador con datos de ejemplo; se guarda el mapeo actual antes de generar la vista previa.'}
            onClick={() => testSample()}>
            <Eye className="mr-1.5 h-3.5 w-3.5 shrink-0" />Probar con datos de ejemplo
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            {!readOnly ? (
              <>
                <Button type="button" variant="outline" disabled={save.isPending} onClick={() => save.mutate({ publish: false })}>Guardar borrador</Button>
                <Button type="button" disabled={save.isPending} onClick={() => save.mutate({ publish: true })}>
                  {save.isPending ? 'Guardando...' : 'Guardar y publicar'}
                </Button>
              </>
            ) : (
              <Button type="button" onClick={() => onOpenChange(false)}>Cerrar</Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
