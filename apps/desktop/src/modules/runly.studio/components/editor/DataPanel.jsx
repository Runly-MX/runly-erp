import { useState } from 'react'
import { Button, DistDropZone, SegmentedControl, SelectField, cn } from '@runly/ui'
import { AlertTriangle, Barcode, Database, FileSpreadsheet, Info, QrCode, Table2, Type, X } from 'lucide-react'
import { autoMapping } from '../../lib/studio-bulk.js'
import { ModuleSourcePicker, rememberedSource } from './ModuleSourcePicker.jsx'
import { RecordsDialog } from './RecordsDialog.jsx'

const NONE = '__none'
const INSERT_AS = [{ value: 'text', label: 'Texto' }, { value: 'qr', label: 'QR' }, { value: 'code128', label: 'Barras' }]
const HINT = 'Conecta una hoja de cálculo o los registros de un módulo y usa sus columnas como campos {{Nombre}} en textos, QR y códigos de barras. Cada registro crea una versión al descargar.'
const ICONS = { text: Type, qr: QrCode, code128: Barcode }

// Rail panel "Datos" (Canva-style bulk create): connect a source, see and edit its
// records, map the design's {{campos}} to columns and drop columns on the page.
// value: null or { fileName, headers, rows, total, truncated, mapping, module, source, ids, images }.
export function DataPanel({ value, onChange, fields, source, disabled, onInsert }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(null), [records, setRecords] = useState(false), [as, setAs] = useState('text')
  const [origin, setOrigin] = useState(() => (rememberedSource(source.rememberKey) ? 'module' : 'file'))
  async function load(file) {
    setBusy(true); setError(null)
    try { const parsed = await source.parse(file); onChange({ fileName: file.name, ...parsed, mapping: autoMapping(fields, parsed.headers) }) }
    catch (failure) { setError(failure?.message || 'No se pudo leer el archivo.') } finally { setBusy(false) }
  }
  if (!value) return (
    <div className="space-y-3">
      <p className="flex gap-2 rounded-md bg-[hsl(var(--muted)/0.5)] p-2.5 text-xs text-[hsl(var(--muted-foreground))]"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /><span>{HINT}</span></p>
      <SegmentedControl ariaLabel="Origen de los datos" value={origin} onChange={setOrigin} className="w-full [&_button]:min-w-0"
        options={[{ value: 'file', label: 'Archivo' }, { value: 'module', label: 'Desde un módulo' }]} />
      {origin === 'module'
        ? <ModuleSourcePicker loadSources={source.sources} loadRows={source.moduleRows} rememberKey={source.rememberKey}
          onLoaded={(item, parsed) => onChange({ fileName: item.label, module: true, source: item.key, ...parsed, mapping: autoMapping(fields, parsed.headers) })} />
        : <DistDropZone variant="compact" accept=".csv,.xlsx" maxSizeMB={2} isUploading={busy} onFile={load} error={error}
          emptyLabel="Sube un CSV o Excel" emptyHint="Primera fila con los nombres de columna, hasta 500 filas" dragActiveLabel="Suelta el archivo aquí" />}
    </div>
  )
  const mapping = { ...autoMapping(fields, value.headers), ...value.mapping }, first = value.rows[0] ?? {}, unmapped = fields.filter(field => !mapping[field])
  const Icon = ICONS[as]
  return (
    <div className="space-y-5">
      <div className="space-y-2 rounded-xl border border-[hsl(var(--border))] p-3">
        <div className="flex items-center gap-2 text-sm">
          {value.module ? <Database className="h-4 w-4 shrink-0 text-sky-600" aria-hidden /> : <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />}
          <span className="min-w-0 flex-1 truncate font-medium">{value.fileName}</span>
          <Button type="button" variant="ghost" size="icon" aria-label="Quitar los datos" className="h-7 w-7" onClick={() => onChange(null)}><X className="h-4 w-4" /></Button>
        </div>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{value.rows.length} {value.rows.length === 1 ? 'versión' : 'versiones'}{value.truncated ? ` de ${value.total}; solo se usan las primeras ${value.rows.length}` : ''} · {value.headers.length} columnas</p>
        <Button type="button" variant="outline" className="w-full gap-1.5" onClick={() => setRecords(true)}><Table2 className="h-4 w-4" aria-hidden />Ver y editar registros</Button>
      </div>

      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Insertar columna en la página</p>
        <SegmentedControl ariaLabel="Insertar como" value={as} onChange={setAs} className="w-full [&_button]:min-w-0" options={INSERT_AS} />
        <div className="flex flex-wrap gap-1.5">
          {value.headers.map(header => (
            <button key={header} type="button" disabled={disabled} onClick={() => onInsert(as, header)} title={`Insertar {{${header}}}`}
              className={cn('flex min-h-8 items-center gap-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)] px-2 text-xs transition-colors hover:border-fuchsia-500/40 hover:bg-[hsl(var(--muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:pointer-events-none disabled:opacity-50')}>
              <Icon className="h-3 w-3" aria-hidden />{header}
            </button>
          ))}
        </div>
        {disabled ? <p className="text-xs text-[hsl(var(--muted-foreground))]">Solo lectura: no puedes insertar elementos.</p> : null}
      </section>

      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Campos del diseño</p>
        {fields.length ? fields.map(field => (
          <div key={field} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] items-end gap-2">
            <div className="min-w-0 pb-2 text-sm"><span className="font-mono text-xs">{`{{${field}}}`}</span>
              {mapping[field] ? <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">Ej.: {first[mapping[field]] || '(vacío)'}</span> : null}</div>
            <SelectField label="Columna" value={mapping[field] || NONE} onValueChange={header => onChange({ ...value, mapping: { ...mapping, [field]: header === NONE ? '' : header } })}
              options={[{ value: NONE, label: 'Dejar vacío' }, ...value.headers.map(header => ({ value: header, label: header }))]} />
          </div>
        )) : <p className="text-xs text-[hsl(var(--muted-foreground))]">Aún no hay campos. Inserta una columna arriba o escribe {'{{Nombre}}'} en un texto.</p>}
        {unmapped.length ? <p className="flex gap-1.5 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{unmapped.length === 1 ? `«${unmapped[0]}» no tiene columna y se imprimirá vacío.` : `${unmapped.length} campos sin columna se imprimirán vacíos.`}</p> : null}
      </section>
      <RecordsDialog open={records} onOpenChange={setRecords} data={value} onChange={onChange} />
    </div>
  )
}
