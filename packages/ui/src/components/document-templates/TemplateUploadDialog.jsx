import { useEffect, useState } from 'react'
import { FilePlus2 } from 'lucide-react'
import { Button } from '../Button.jsx'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../Dialog.jsx'
import { DistDropZone } from '../DistDropZone.jsx'
import { SegmentedControl } from '../SegmentedControl.jsx'
import { CheckboxField, TextField } from '../FormFields.jsx'
import { ALL_FORMATS, BLANK_FORMATS, FORMAT_LABELS, MAX_TEMPLATE_MB, acceptFor, formatOfName } from './template-utils.js'

const EMPTY = { mode: 'upload', file: null, format: 'docx', name: '', isDefault: false, visibility: 'personal' }

// Adds a template: an uploaded file (docx/xlsx/pptx/pdf) or a blank document
// that already lists the kind's fields. `onSubmit` receives the form values.
export function TemplateUploadDialog({ open, onOpenChange, kind, hasTemplates, busy, onSubmit }) {
  const formats = kind?.formats ?? ALL_FORMATS
  const blankFormats = BLANK_FORMATS.filter((f) => formats.includes(f))
  const [form, setForm] = useState(EMPTY)
  const [fileError, setFileError] = useState('')

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY, format: blankFormats[0] ?? 'docx', isDefault: !hasTemplates })
      setFileError('')
    }
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

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
  const canSave = isUpload ? Boolean(form.file) : blankFormats.length > 0 && Boolean(form.name.trim())

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader icon={FilePlus2}>
          <DialogTitle>Nueva plantilla</DialogTitle>
          <DialogDescription>
            Sube tu propio formato o empieza con un documento en blanco que ya incluye los campos de «{kind?.label ?? 'este tipo'}».
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
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
          <TextField label="Nombre" required={!isUpload} value={form.name} maxLength={120}
            placeholder={kind?.label ?? 'Plantilla'} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <div className="space-y-1.5">
            <SegmentedControl ariaLabel="Visibilidad de la plantilla" value={form.visibility}
              onChange={(visibility) => setForm((f) => ({ ...f, visibility, isDefault: visibility === 'company' ? f.isDefault : false }))}
              options={[{ value: 'personal', label: 'Personal' }, { value: 'company', label: 'Compartida con la empresa' }]} />
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              {form.visibility === 'personal' ? 'Solo tú la ves y la usas. Puedes compartirla con la empresa después.' : 'Todos los que usan este tipo de documento podrán usarla.'}
            </p>
          </div>
          {form.visibility === 'company' ? <CheckboxField label="Usar como plantilla predeterminada" checked={form.isDefault}
            onChange={(e) => setForm((f) => ({ ...f, isDefault: Boolean(e?.target ? e.target.checked : e) }))} /> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" disabled={!canSave || busy} onClick={() => onSubmit({ ...form, name: form.name.trim() })}>
            {busy ? 'Guardando...' : isUpload ? 'Subir plantilla' : 'Crear documento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
