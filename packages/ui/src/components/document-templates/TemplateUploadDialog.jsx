import { useEffect, useMemo, useState } from 'react'
import { FilePlus2 } from 'lucide-react'
import { Button } from '../Button.jsx'
import { DistDropZone } from '../DistDropZone.jsx'
import { SegmentedControl } from '../SegmentedControl.jsx'
import { CheckboxField, SelectField, TextField } from '../FormFields.jsx'
import { DialogHint, TemplateDialogFrame } from './TemplateDialogFrame.jsx'
import { ALL_FORMATS, BLANK_FORMATS, FORMAT_LABELS, MAX_TEMPLATE_MB, acceptFor, formatOfName, moduleKeyOf, moduleOptions } from './template-utils.js'

const EMPTY = { mode: 'upload', file: null, format: 'docx', name: '', isDefault: false, visibility: 'personal', moduleKey: '', kindKey: '' }

// Adds a template: an uploaded file (docx/xlsx/pptx/pdf) or a blank document
// that already lists the kind's fields. With a fixed `kind` (module screens)
// the type is preset; with `kinds` (the hub) the user picks the module first
// and then the type of document. `onSubmit` receives the form values + `kind`.
export function TemplateUploadDialog({ open, onOpenChange, kind: fixedKind = null, kinds = [], defaultKindKey = '', hasTemplates, busy, onSubmit }) {
  const [form, setForm] = useState(EMPTY)
  const [fileError, setFileError] = useState('')
  const modules = useMemo(() => moduleOptions(kinds), [kinds])
  const kindOptions = useMemo(
    () => kinds.filter((k) => moduleKeyOf(k) === form.moduleKey).map((k) => ({ value: k.key, label: k.label })),
    [kinds, form.moduleKey],
  )
  const kind = fixedKind ?? kinds.find((k) => k.key === form.kindKey) ?? null
  const formats = kind?.formats ?? ALL_FORMATS
  const blankFormats = BLANK_FORMATS.filter((f) => formats.includes(f))

  useEffect(() => {
    if (!open) return
    const preset = kinds.find((k) => k.key === defaultKindKey) ?? (kinds.length === 1 ? kinds[0] : null)
    setForm({
      ...EMPTY,
      format: (fixedKind ?? preset)?.formats?.find((f) => BLANK_FORMATS.includes(f)) ?? 'docx',
      isDefault: Boolean(fixedKind) && !hasTemplates,
      moduleKey: preset ? moduleKeyOf(preset) : '',
      kindKey: preset?.key ?? '',
    })
    setFileError('')
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function pickModule(moduleKey) {
    const inModule = kinds.filter((k) => moduleKeyOf(k) === moduleKey)
    setForm((f) => ({ ...f, moduleKey, kindKey: inModule.length === 1 ? inModule[0].key : '', file: null }))
  }
  function pickKind(kindKey) {
    const next = kinds.find((k) => k.key === kindKey)
    const nextBlank = BLANK_FORMATS.filter((fmt) => (next?.formats ?? ALL_FORMATS).includes(fmt))
    setForm((f) => ({ ...f, kindKey, file: null, mode: nextBlank.length ? f.mode : 'upload', format: nextBlank.includes(f.format) ? f.format : nextBlank[0] ?? 'docx' }))
    setFileError('')
  }

  function pickFile(file) {
    const format = formatOfName(file?.name)
    if (!format || !formats.includes(format)) {
      setFileError(`Sube un archivo ${formats.map((f) => `.${f}`).join(', ')}`)
      return
    }
    setFileError('')
    setForm((f) => ({ ...f, file, name: f.name || file.name.replace(/\.[^.]+$/, '') }))
  }

  const isUpload = form.mode === 'upload'
  const canSave = Boolean(kind) && (isUpload ? Boolean(form.file) : blankFormats.length > 0 && Boolean(form.name.trim()))

  const footer = (
    <>
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
      <Button type="button" disabled={!canSave || busy} onClick={() => onSubmit({ ...form, kind, name: form.name.trim() })}>
        {busy ? 'Guardando...' : isUpload ? 'Subir plantilla' : 'Crear documento'}
      </Button>
    </>
  )

  return (
    <TemplateDialogFrame open={open} onOpenChange={onOpenChange} size="xl" icon={FilePlus2} title="Nueva plantilla"
      subtitle={fixedKind ? `Para «${fixedKind.label}».` : 'Elige el módulo y el tipo de documento.'} footer={footer}>
      {!fixedKind ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Módulo" required options={modules} value={form.moduleKey} placeholder="Elegir módulo..." onChange={pickModule} />
          <SelectField label="Tipo de documento" required options={kindOptions} value={form.kindKey} disabled={!form.moduleKey}
            placeholder={form.moduleKey ? 'Elegir tipo...' : 'Primero el módulo'} onChange={pickKind} />
        </div>
      ) : null}
      {kind ? (
        <>
          {blankFormats.length ? (
            <SegmentedControl ariaLabel="Origen de la plantilla" value={form.mode}
              onChange={(mode) => setForm((f) => ({ ...f, mode }))}
              options={[{ value: 'upload', label: 'Subir archivo' }, { value: 'blank', label: 'Documento en blanco' }]} />
          ) : null}
          {isUpload ? (
            <>
              <DistDropZone accept={acceptFor(formats)} maxSizeMB={MAX_TEMPLATE_MB} file={form.file} onFile={pickFile}
                onClear={() => setForm((f) => ({ ...f, file: null }))} isUploading={busy}
                emptyLabel={`Arrastra tu plantilla ${formats.map((f) => `.${f}`).join(', ')}`} />
              {fileError ? <p className="text-xs text-[hsl(var(--destructive))]">{fileError}</p> : null}
            </>
          ) : (
            <SegmentedControl ariaLabel="Formato del documento" value={form.format}
              onChange={(format) => setForm((f) => ({ ...f, format }))}
              options={blankFormats.map((f) => ({ value: f, label: FORMAT_LABELS[f] }))} />
          )}
          <DialogHint>
            {isUpload ? 'Sube tu propio formato; Runly propone dónde colocar los campos.' : `El documento en blanco ya incluye los campos de «${kind.label}».`}
          </DialogHint>
          <TextField label="Nombre" required={!isUpload} value={form.name} maxLength={120}
            placeholder={kind.label ?? 'Plantilla'} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <div className="space-y-1.5">
            <SegmentedControl ariaLabel="Visibilidad de la plantilla" value={form.visibility}
              onChange={(visibility) => setForm((f) => ({ ...f, visibility, isDefault: visibility === 'company' ? f.isDefault : false }))}
              options={[{ value: 'personal', label: 'Personal' }, { value: 'company', label: 'Compartida con la empresa' }]} />
            <DialogHint>
              {form.visibility === 'personal' ? 'Solo tú la ves y la usas. Puedes compartirla después.' : 'Todos los que usan este tipo de documento podrán usarla.'}
            </DialogHint>
          </div>
          {form.visibility === 'company' ? <CheckboxField label="Usar como plantilla predeterminada" checked={form.isDefault}
            onChange={(e) => setForm((f) => ({ ...f, isDefault: Boolean(e?.target ? e.target.checked : e) }))} /> : null}
        </>
      ) : (
        <DialogHint>Al elegir el tipo de documento podrás subir tu archivo o crear uno en blanco.</DialogHint>
      )}
    </TemplateDialogFrame>
  )
}
