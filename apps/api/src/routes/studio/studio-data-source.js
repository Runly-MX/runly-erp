import ExcelJS from 'exceljs'
import { parse as parseCsv } from 'csv-parse/sync'
import { StudioError } from '../../../../shared/studio/document.js'

// Bulk-create data source: read once, returned to the editor, never stored.
export const STUDIO_DATA_LIMITS = Object.freeze({ bytes: 2 * 1024 * 1024, rows: 500, columns: 50, cell: 2000 })

const cellText = cell => {
  if (cell == null) return ''
  // ExcelJS stores sheet dates at UTC midnight; local getters would shift them a day in the Americas.
  if (cell instanceof Date) return [cell.getUTCFullYear(), cell.getUTCMonth() + 1, cell.getUTCDate()].map((part, i) => String(part).padStart(i ? 2 : 4, '0')).join('-')
  if (typeof cell === 'object') return String(cell.text ?? cell.result ?? cell.richText?.map(part => part.text).join('') ?? '')
  return String(cell)
}

export async function parseStudioDataFile(buffer, filename) {
  if (buffer.length > STUDIO_DATA_LIMITS.bytes) throw new StudioError('El archivo supera 2 MB.', 413)
  const name = String(filename ?? '').toLowerCase()
  let matrix = []
  try {
    if (name.endsWith('.csv')) matrix = parseCsv(buffer, { columns: false, skip_empty_lines: true, bom: true, relax_column_count: true, delimiter: [',', ';', '\t'] })
    else if (name.endsWith('.xlsx')) {
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(buffer)
      workbook.worksheets[0]?.eachRow({ includeEmpty: false }, row => { matrix.push(row.values.slice(1).map(cellText)) })
    } else throw new StudioError('Formato no admitido. Usa CSV o XLSX.')
  } catch (error) {
    if (error instanceof StudioError) throw error
    throw new StudioError('No se pudo leer el archivo. Revisa que sea un CSV o XLSX válido.')
  }
  if (matrix.length < 2) throw new StudioError('El archivo necesita una fila de encabezados y al menos una fila de datos.')
  const headers = [], used = new Set()
  for (const [index, value] of matrix[0].slice(0, STUDIO_DATA_LIMITS.columns).entries()) {
    let header = String(value ?? '').trim().slice(0, 60) || `Columna ${index + 1}`, n = 2
    while (used.has(header)) header = `${header} (${n++})`
    used.add(header); headers.push(header)
  }
  const data = matrix.slice(1).map(cells => Object.fromEntries(headers.map((header, i) => [header, String(cells[i] ?? '').trim().slice(0, STUDIO_DATA_LIMITS.cell)])))
    .filter(row => Object.values(row).some(Boolean))
  if (!data.length) throw new StudioError('El archivo no tiene filas con datos.')
  return { headers, rows: data.slice(0, STUDIO_DATA_LIMITS.rows), total: data.length, truncated: data.length > STUDIO_DATA_LIMITS.rows }
}
