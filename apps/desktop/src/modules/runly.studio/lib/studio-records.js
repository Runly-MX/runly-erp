// How a module record is summarized in the picker: what identifies it first, then what describes it.
const LAYOUT = {
  inventory: { title: ['Número de activo', 'Número de serie'], detail: ['Nombre', 'Marca', 'Modelo', 'Categoría'], extra: ['Ubicación'] },
  fleet: { title: ['Placa', 'Número económico'], detail: ['Marca', 'Modelo', 'Tipo'], extra: ['Conductor'] },
  hr: { title: ['Nombre completo'], detail: ['Número de empleado', 'Puesto'], extra: ['Departamento'] },
  contacts: { title: ['Nombre'], detail: ['Correo', 'Teléfono'], extra: ['Ciudad'] },
}
const join = (row, keys, separator) => keys.map(key => row[key]).filter(Boolean).join(separator)

export function describeRecord(source, row, headers = Object.keys(row)) {
  const layout = LAYOUT[source]
  if (!layout) return { title: row[headers[0]] || '(sin dato)', detail: headers.slice(1, 4).map(header => row[header]).filter(Boolean).join(' · '), extra: '' }
  return { title: join(row, layout.title, ' · ') || row[layout.detail[0]] || '(sin identificador)', detail: join(row, layout.detail, ' · '), extra: join(row, layout.extra, ' · ') }
}
