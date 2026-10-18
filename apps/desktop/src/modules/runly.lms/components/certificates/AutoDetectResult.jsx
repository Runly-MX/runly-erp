import { Alert, AlertDescription, AlertTitle, Badge, Button } from '@runly/ui'
import { AlertTriangle, CheckCircle2, Download, LayoutTemplate, ListChecks } from 'lucide-react'
import { docxTagLabel, formatInfo } from '../../lib/lmsCert.js'
import { fieldLabel } from '../../lib/certLayout.js'

const unique = (list) => [...new Set(list)]

// Summary after an upload with automatic detection: the tags placed in a
// Word/PowerPoint file (saved.autoTag) or the fields found in a PDF
// (saved.autoLayout). Renders nothing when neither was applied.
export function AutoDetectResult({ saved, onDownload, downloading = false, onReview, onEditLayout }) {
  const tagged = saved?.autoTag?.saved ? saved.autoTag : null
  const layout = saved?.autoLayout ?? null
  if (!tagged && !layout) return null
  const app = formatInfo(saved.source).app

  const recognized = tagged
    ? unique(tagged.applied.map((item) => item.tag)).map(docxTagLabel)
    : layout.matched.map((item) => fieldLabel(item.key))
  const missing = tagged ? tagged.missing.map(docxTagLabel) : layout.missing.map(fieldLabel)

  return (
    <div className="space-y-3">
      <Alert variant={recognized.length ? 'success' : 'warning'} className="rounded-md p-3">
        {recognized.length ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        <AlertTitle>
          {tagged
            ? `Se reconocieron ${recognized.length} ${recognized.length === 1 ? 'campo' : 'campos'}`
            : recognized.length ? `Se detectaron ${recognized.length} ${recognized.length === 1 ? 'campo' : 'campos'}` : 'No se detectaron campos'}
        </AlertTitle>
        <AlertDescription className="text-xs">
          {tagged
            ? `La plantilla ya quedó con etiquetas y funciona desde ahora. Descarga la copia con etiquetas si quieres seguir editándola en ${app}.`
            : recognized.length
              ? 'Los campos ya quedaron colocados sobre el PDF. Ajusta su posición y tamaño en el editor si hace falta.'
              : 'Coloca los datos del certificado en el editor de campos.'}
        </AlertDescription>
      </Alert>
      {recognized.length ? (
        <div className="flex flex-wrap gap-1.5" aria-label="Campos reconocidos">
          {recognized.map((label) => <Badge key={label} variant="secondary">{label}</Badge>)}
        </div>
      ) : null}
      {layout?.defaulted?.includes('qr') ? (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">El código QR se colocó en la esquina inferior derecha.</p>
      ) : null}
      {missing.length ? (
        <Alert variant="warning" className="rounded-md p-3">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No se encontró dónde poner</AlertTitle>
          <AlertDescription className="text-xs">
            {missing.join(', ')}. {tagged ? `Agrégalas a mano en ${app} si tu formato las necesita.` : 'Agrégalos en el editor de campos si tu formato los necesita.'}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {tagged ? (
          <>
            <Button type="button" variant="outline" size="sm" onClick={onDownload} disabled={downloading}><Download />Descargar con etiquetas</Button>
            <Button type="button" variant="outline" size="sm" onClick={onReview}><ListChecks />Revisar</Button>
          </>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={onEditLayout}><LayoutTemplate />Ajustar campos</Button>
        )}
      </div>
    </div>
  )
}
