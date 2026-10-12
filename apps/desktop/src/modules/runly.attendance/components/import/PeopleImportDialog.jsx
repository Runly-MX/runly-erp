import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Button, CheckboxField, ColumnMappingStep, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DistDropZone, ErrorState, ImportStepIndicator,
} from '@runly/ui'
import { CheckCircle2, Download, Eye, FileSpreadsheet, ListChecks, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../../../auth/AuthProvider'
import { useActiveCompany } from '../../../../company/ActiveCompanyProvider'
import { getApiUrl } from '../../../../lib/runtimeConfig.js'
import { attendanceRequest, saveBlob } from '../../lib/attendanceRequest.js'
import { PeopleImportPreview } from './PeopleImportPreview.jsx'

const STEPS = [
  { key: 'file', label: 'Archivo', icon: Upload },
  { key: 'mapping', label: 'Relacionar columnas', icon: ListChecks },
  { key: 'preview', label: 'Vista previa', icon: Eye },
  { key: 'result', label: 'Resultado', icon: CheckCircle2 },
]
const DEFAULT_OPTIONS = { createMissing: true, linkHr: true, updateExisting: false }

export function PeopleImportDialog({ open, onOpenChange, onDone }) {
  const { session } = useAuth()
  const { activeCompanyId } = useActiveCompany()
  const qc = useQueryClient()
  const token = session?.access_token
  const [step, setStep] = useState('file')
  const [parsed, setParsed] = useState(null)
  const [mapping, setMapping] = useState({})
  const [options, setOptions] = useState(DEFAULT_OPTIONS)
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const call = (path, body, extra) => attendanceRequest({ apiBaseUrl: getApiUrl(), token, companyId: activeCompanyId, path: `/attendance/people/import${path}`, body, ...extra })

  function reset() {
    setStep('file'); setParsed(null); setMapping({}); setOptions(DEFAULT_OPTIONS)
    setPreview(null); setResult(null); setError('')
  }

  function close(next) {
    if (!next) reset()
    onOpenChange(next)
  }

  async function downloadTemplate() {
    try {
      saveBlob(await call('/template', undefined, { blob: true }), 'plantilla-personas-asistencia.xlsx')
    } catch (err) { toast.error(err.message) }
  }

  async function handleFile(file) {
    if (!file) return
    setBusy(true); setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const data = await call('/parse', form)
      if (!data.rows?.length) throw new Error('El archivo no tiene filas con datos.')
      setParsed(data)
      setMapping(data.suggestedMapping ?? {})
      if (data.templateDetected) await runPreview(data.rows, data.suggestedMapping ?? {}, options)
      else setStep('mapping')
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  async function runPreview(rows = parsed.rows, map = mapping, opts = options) {
    setBusy(true); setError('')
    try {
      setPreview(await call('/preview', { rows, mapping: map, options: opts }))
      setStep('preview')
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  async function commit() {
    setBusy(true); setError('')
    try {
      setResult(await call('/commit', { rows: parsed.rows, mapping, options }))
      await qc.invalidateQueries({ queryKey: ['attendance'] })
      setStep('result')
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  const missingRequired = (parsed?.fields ?? []).some((f) => f.required && !mapping[f.key])
  const importable = (preview?.summary.create ?? 0) + (preview?.summary.update ?? 0)
  const setOption = (key) => (e) => setOptions((o) => ({ ...o, [key]: e.target.checked }))

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent scrollable size="2xl">
        <DialogHeader>
          <DialogTitle>Importar personas</DialogTitle>
          <DialogDescription>Carga un Excel o CSV con tu personal y relaciona cada columna con un campo de Asistencia.</DialogDescription>
        </DialogHeader>
        <ImportStepIndicator layout="bar" steps={STEPS} current={step} className="mt-1 shrink-0" />
        <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-0.5">
          {step === 'file' ? (
            <div className="space-y-3">
              <DistDropZone accept=".xlsx,.csv" maxSizeMB={25} isUploading={busy} onFile={handleFile}
                emptyLabel="Arrastra tu archivo aquí" emptyHint="o haz clic para elegir un .xlsx o .csv (hasta 2,000 filas)" dragActiveLabel="Suelta el archivo aquí" />
              <div className="space-y-2 rounded-xl bg-[hsl(var(--muted))]/40 px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p>La plantilla trae las columnas Código, Nombre, Apellido, Tipo, Grupo, Categoría, Turno, PIN y Código RH, y una hoja con los grupos, categorías y turnos válidos de la empresa.</p>
                  <Button type="button" variant="outline" size="sm" className="min-h-11 shrink-0 sm:min-h-0" onClick={downloadTemplate}>
                    <Download className="mr-1.5 h-3.5 w-3.5" />Descargar plantilla base
                  </Button>
                </div>
                <p>Si no usas la plantilla, en el siguiente paso relacionas tus columnas con los campos de Asistencia, igual que en Inventario.</p>
              </div>
            </div>
          ) : null}

          {step === 'mapping' && parsed ? (
            <div className="space-y-4">
              <p className="flex min-w-0 items-center gap-2 text-sm">
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-(--brand-primary)" />
                <span className="truncate font-medium">{parsed.fileName}</span>
                <span className="shrink-0 text-[hsl(var(--muted-foreground))]">· {parsed.rows.length} filas</span>
              </p>
              <ColumnMappingStep headers={parsed.headers} rows={parsed.rows} fields={parsed.fields} mapping={mapping} onMappingChange={setMapping} />
              <div className="space-y-3 rounded-xl border border-[hsl(var(--border))] px-4 py-3">
                <CheckboxField id="imp-create" label="Crear grupos y categorías que no existan" checked={options.createMissing} onChange={setOption('createMissing')} />
                <CheckboxField id="imp-link" label="Vincular con el expediente de RH cuando coincida el código o el correo" checked={options.linkHr} onChange={setOption('linkHr')} />
                <CheckboxField id="imp-update" label="Actualizar personas que ya existen (mismo código)" checked={options.updateExisting} onChange={setOption('updateExisting')} />
              </div>
            </div>
          ) : null}

          {step === 'preview' && preview ? <PeopleImportPreview preview={preview} /> : null}

          {step === 'result' && result ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--foreground))]">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />Importación terminada
              </div>
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[['Creadas', result.created], ['Actualizadas', result.updated], ['Vinculadas con RH', result.linked], ['Omitidas', result.skipped], ['Errores', result.errors]].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-[hsl(var(--border))] px-3 py-2">
                    <dd className="text-lg font-semibold tabular-nums">{value ?? 0}</dd>
                    <dt className="text-xs text-[hsl(var(--muted-foreground))]">{label}</dt>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {error ? <ErrorState title="No se pudo procesar el archivo" description={error} /> : null}
        </div>
        <DialogFooter className="shrink-0">
          {step === 'mapping' ? <Button type="button" variant="ghost" onClick={() => setStep('file')}>Cambiar archivo</Button> : null}
          {step === 'preview' ? <Button type="button" variant="ghost" disabled={busy} onClick={() => setStep('mapping')}>Volver a relacionar columnas</Button> : null}
          {step === 'result' ? (
            <>
              <Button type="button" variant="ghost" onClick={reset}>Seguir importando</Button>
              <Button type="button" onClick={() => { onDone?.(result); close(false) }}>Cerrar</Button>
            </>
          ) : (
            <Button type="button" variant="ghost" onClick={() => close(false)}>Cancelar</Button>
          )}
          {step === 'mapping' ? (
            <Button type="button" disabled={busy || missingRequired} onClick={() => runPreview()}>{busy ? 'Analizando...' : 'Revisar'}</Button>
          ) : null}
          {step === 'preview' ? (
            <Button type="button" disabled={busy || importable === 0} onClick={commit}>
              {busy ? 'Importando...' : importable === 0 ? 'Nada que importar' : `Importar ${importable} ${importable === 1 ? 'persona' : 'personas'}`}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
