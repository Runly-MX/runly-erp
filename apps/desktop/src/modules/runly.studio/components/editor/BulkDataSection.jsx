import { useState } from 'react'
import { Button, DistDropZone, SegmentedControl, SelectField } from '@runly/ui'
import { Database, FileSpreadsheet, Info, Plus, X } from 'lucide-react'
import { autoMapping } from '../../lib/studio-bulk.js'
import { ModuleSourcePicker } from './ModuleSourcePicker.jsx'

const NONE = '__none'

// "Datos para varias versiones": a CSV/XLSX fills the design's {{campo}} text
// placeholders, one version per row. value: null or { fileName, headers, rows, total, truncated, mapping }.
export function BulkDataSection({ fields, value, onChange, onParse, onInsertField, loadSources, loadRows }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(null), [origin, setOrigin] = useState('file')
  async function load(file) {
    setBusy(true); setError(null)
    try {
      const parsed = await onParse(file)
      onChange({ fileName: file.name, ...parsed, mapping: autoMapping(fields, parsed.headers) })
    } catch (failure) { setError(failure?.message || 'No se pudo leer el archivo.') } finally { setBusy(false) }
  }
  const mapping = value ? { ...autoMapping(fields, value.headers), ...value.mapping } : {}
  const hint = <p className="flex gap-2 rounded-md bg-[hsl(var(--muted)/0.5)] p-2.5 text-xs text-[hsl(var(--muted-foreground))]"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
    <span>Escribe campos como <strong>{'{{Nombre}}'}</strong> en textos, códigos QR o de barras; cada fila o registro crea una versión con sus valores. El diseño guardado no cambia.</span></p>
  if (!value) return (
    <div className="space-y-2">
      {hint}
      {loadSources ? <SegmentedControl ariaLabel="Origen de los datos" value={origin} onChange={setOrigin} className="w-full [&_button]:min-w-0"
        options={[{ value: 'file', label: 'Archivo' }, { value: 'module', label: 'Desde un módulo' }]} /> : null}
      {origin === 'module' && loadSources
        ? <ModuleSourcePicker loadSources={loadSources} loadRows={loadRows}
          onLoaded={(source, parsed) => onChange({ fileName: source.label, module: true, source: source.key, ...parsed, mapping: autoMapping(fields, parsed.headers) })} />
        : <DistDropZone variant="compact" accept=".csv,.xlsx" maxSizeMB={2} isUploading={busy} onFile={load} error={error}
          emptyLabel="Sube un CSV o Excel" emptyHint="Primera fila con los nombres de columna, hasta 500 filas" dragActiveLabel="Suelta el archivo aquí" />}
    </div>
  )
  const first = value.rows[0] ?? {}
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-md border border-[hsl(var(--border))] px-2.5 py-2 text-sm">
        {value.module ? <Database className="h-4 w-4 shrink-0 text-sky-600" aria-hidden /> : <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />}
        <span className="min-w-0 flex-1 truncate font-medium">{value.fileName}</span>
        <span className="shrink-0 text-xs text-[hsl(var(--muted-foreground))]">{value.rows.length} {value.rows.length === 1 ? 'fila' : 'filas'}{value.truncated ? ` de ${value.total}` : ''}</span>
        <Button type="button" variant="ghost" size="icon" aria-label={value.module ? 'Quitar datos' : 'Quitar archivo'} className="h-7 w-7" onClick={() => onChange(null)}><X className="h-4 w-4" /></Button>
      </div>
      {value.truncated ? <p className="text-xs text-amber-700 dark:text-amber-300">Solo se usan las primeras {value.rows.length} filas.</p> : null}
      {fields.length ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Campos del diseño</p>
          {fields.map(field => (
            <div key={field} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] items-end gap-2">
              <div className="min-w-0 pb-2 text-sm"><span className="font-mono text-xs">{`{{${field}}}`}</span>
                {mapping[field] ? <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">Ej.: {first[mapping[field]] || '(vacío)'}</span> : null}</div>
              <SelectField label="Columna" value={mapping[field] || NONE} onValueChange={header => onChange({ ...value, mapping: { ...mapping, [field]: header === NONE ? '' : header } })}
                options={[{ value: NONE, label: 'Dejar vacío' }, ...value.headers.map(header => ({ value: header, label: header }))]} />
            </div>
          ))}
        </div>
      ) : hint}
      {onInsertField ? (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Insertar columna en la página</p>
          <div className="flex flex-wrap gap-1.5">
            {value.headers.map(header => <Button key={header} type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => onInsertField(header)}><Plus className="h-3 w-3" aria-hidden />{header}</Button>)}
          </div>
        </div>
      ) : null}
    </div>
  )
}
