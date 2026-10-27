// Presentation rules for importing designs and templates. The engine reports
// what it found (warnings, blockingErrors); this file only decides how that is
// labelled. Nothing here marks a file as better than the report says.
export const IMPORT_MAX_BYTES = 64 * 1024 * 1024
export const SVG_MAX_BYTES = 32000

export function validateImportFile(file) {
  if (!file) return { ok: false, error: 'Selecciona un archivo.' }
  const name = String(file.name ?? '').toLowerCase()
  const kind = name.endsWith('.runlystudio') ? 'package' : name.endsWith('.svg') ? 'svg' : null
  if (!kind) return { ok: false, error: 'Formato no admitido. Usa un paquete .runlystudio o un archivo .svg.' }
  if (!file.size) return { ok: false, error: 'El archivo está vacío.' }
  if (file.size > IMPORT_MAX_BYTES) return { ok: false, error: 'El archivo supera 64 MB.' }
  if (kind === 'svg' && file.size > SVG_MAX_BYTES) return { ok: false, error: 'Este SVG supera 32 KB, el máximo que Studio puede convertir sin perder fidelidad.' }
  return { ok: true, kind }
}

// Fidelity levels, ordered from best to worst. `cannotImport` levels cannot be imported.
export const FIDELITY = {
  editable: { rank: 0, label: 'Compatible y editable', tone: 'success', description: 'Todo el contenido se importa como objetos que puedes editar en Studio.' },
  adjusted: { rank: 1, label: 'Compatible con ajustes', tone: 'warning', description: 'Se puede editar, pero Studio cambia algunos elementos. Revisa cada ajuste antes de importar.' },
  raster: { rank: 2, label: 'Requiere conversión a imagen', tone: 'warning', description: 'Hay elementos que se convierten en imagen y dejan de ser editables como texto o formas.' },
  incompatible: { rank: 3, label: 'No compatible', tone: 'destructive', cannotImport: true, description: 'Studio no puede importar este archivo.' },
}

const LICENSE_NOTICE = /^Las licencias son declaraciones no verificadas/i
const RASTER = /rasteri|raster|(?:conv(?:ie|e)rt|transform)\w*\s+(?:en|a)\s+(?:una\s+)?imagen|como imagen/i
const PAGE = /p[aá]gina\s+(\d+)/i

// Splits warnings into fidelity losses and the standing licence notice, and
// derives the single level the UI shows. A conversion to image always wins
// over "adjusted": an import is never presented as fully editable when any
// object is converted.
export function classifyImport(report) {
  const blockers = (report?.blockingErrors ?? []).map(text => ({ text: String(text), page: null }))
  const warnings = report?.warnings ?? []
  const losses = warnings.filter(text => !LICENSE_NOTICE.test(text)).map(text => ({
    text: String(text), kind: RASTER.test(text) ? 'raster' : 'adjust', page: PAGE.exec(text)?.[1] ? Number(PAGE.exec(text)[1]) : null,
  }))
  const licenseNotice = warnings.some(text => LICENSE_NOTICE.test(text))
  const level = blockers.length ? 'incompatible' : losses.some(row => row.kind === 'raster') ? 'raster' : losses.length ? 'adjusted' : 'editable'
  return { level, ...FIDELITY[level], blockers, losses, licenseNotice, needsAcceptance: losses.length > 0 || licenseNotice }
}

const TARGETS = [
  { value: 'design', label: 'Crear diseño', hint: 'Se abre en Mis diseños para seguir editando.', permission: 'canUse' },
  { value: 'personal', label: 'Guardar como plantilla personal', hint: 'Solo tú la verás en Plantillas.', permission: 'canSavePersonal' },
  { value: 'company', label: 'Guardar como plantilla de la empresa', hint: 'Todo el equipo podrá usarla.', permission: 'canSaveCompany' },
]
// Destinations the person may use; company publishing is never offered without permission.
export const importTargets = permissions => TARGETS.filter(target => permissions?.[target.permission]).map(({ permission: _permission, ...target }) => target)

const BY_STATUS = {
  401: 'Tu sesión terminó. Vuelve a iniciar sesión e importa de nuevo.',
  403: 'No tienes permiso para importar en este destino.',
  409: 'La importación cambió o caducó. Vuelve a prepararla.',
  413: 'El archivo o sus imágenes superan el límite permitido.',
  415: 'Formato no admitido. Usa .runlystudio o .svg.',
  426: 'Actualiza la aplicación para importar archivos.',
  429: 'Hay demasiadas importaciones en curso. Confirma o cancela las pendientes y vuelve a intentarlo.',
}
export function importErrorMessage(error) {
  const status = Number(error?.status)
  if (status === 409 && /advertencias/i.test(error?.message ?? '')) return error.message
  if (BY_STATUS[status]) return BY_STATUS[status]
  if (status >= 500) return 'El servidor no pudo procesar el archivo. Vuelve a intentarlo en unos minutos.'
  if (error?.name === 'TypeError' || /failed to fetch|networkerror|load failed/i.test(String(error?.message))) return 'No se pudo conectar con el servidor. Revisa tu conexión.'
  const message = String(error?.message ?? '').replace(/\s+/g, ' ').trim()
  return message && message.length <= 220 ? message : 'No se pudo importar el archivo.'
}

// Document the declarative preview as a Studio scene so StudioThumbnail can draw it.
export const previewDocument = preview => preview?.page ? { schemaVersion: 7, unit: 'px', page: preview.page, objects: preview.objects ?? [], additionalPages: [] } : null
