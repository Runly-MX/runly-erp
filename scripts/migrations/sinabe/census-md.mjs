// Spanish operator report for census.json (aggregates only).
const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('es-MX') : String(n))
const bytes = (n) => {
  if (n == null) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n, u = 0
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++ }
  return `${v.toFixed(u ? 1 : 0)} ${units[u]}`
}
const table = (headers, rows) => rows.length
  ? [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(fmt).join(' | ')} |`)].join('\n')
  : '_Sin datos._'
const kv = (obj) => table(['Concepto', 'Valor'], Object.entries(obj ?? {}).map(([k, v]) => [k, typeof v === 'object' && v !== null ? JSON.stringify(v) : v]))
const dup = (label, s) => [label, s.nulos, s.vacios, s.distintos, s.valoresDuplicados, s.filasConDuplicado]

export function renderCensusMarkdown(c) {
  const d = c.datos, e = c.esquema, a = c.archivos, l = a.listado
  const out = []
  out.push('# Censo de sinabe', '', `Generado: ${c.generado}. Tamaño del dump: ${bytes(c.entrada.bytesDump)}. ` +
    `Lectura del dump: ${fmt(c.duracionMs.lecturaDump)} ms; total: ${fmt(c.duracionMs.total)} ms.`, '',
  'Este reporte contiene solo conteos agregados; no incluye números de serie, activos, folios, nombres, correos, firmas ni nombres de archivo.', '')

  out.push('## Esquema', '', kv({
    'Migraciones aplicadas': e.migracionesAplicadas, 'Última migración': e.ultimaMigracion ?? '(ninguna)',
    'Historial de migraciones al día': e.esquemaActual ? 'sí' : 'no', 'Tablas y columnas actuales completas': e.esquemaCompletoPorColumnas ? 'sí' : 'no', 'Migraciones pendientes': e.migracionesPendientes.length,
    'Migraciones desconocidas': e.migracionesDesconocidas.length, 'Celdas JSON inválidas': e.erroresJson,
  }), '')
  if (e.tablasFaltantes.length) out.push(`Tablas faltantes: ${e.tablasFaltantes.join(', ')}.`, '')
  for (const [t, cols] of Object.entries(e.columnasFaltantes)) out.push(`- Columnas faltantes en \`${t}\`: ${cols.join(', ')}`)
  for (const [t, cols] of Object.entries(e.columnasExtra)) out.push(`- Columnas extra (ignoradas) en \`${t}\`: ${cols.join(', ')}`)
  out.push('')

  out.push('## Conteos por tabla', '', table(['Colección', 'Filas'], Object.entries(c.conteos)), '')

  const inv = d.inventarios
  out.push('## Inventarios', '', table(['Estado', 'Inventarios'], Object.entries(inv.porEstado)), '', kv({
    Deshabilitados: inv.deshabilitados, 'ALTA sin fecha de alta': inv.altaSinFechaAlta, 'BAJA sin fecha de baja': inv.bajaSinFechaBaja,
    'Sin fecha de recepción': inv.sinFechaRecepcion, 'Con detalles JSON': inv.conDetallesJson, 'Sin ubicación': inv.sinUbicacion,
    'Con factura': inv.conFactura, 'Con orden de compra': inv.conOrdenCompra, 'Con condiciones': inv.conCondiciones,
    'Con más de una condición': inv.conMasDeUnaCondicion, 'Con campos personalizados': inv.conCamposPersonalizados,
    'Con imágenes': inv.conImagenes, 'Con archivos': inv.conArchivos,
  }), '', '### Identificadores (solo conteos)', '',
  table(['Campo', 'Nulos', 'Vacíos', 'Distintos', 'Valores duplicados', 'Filas con duplicado'], [
    dup('Número de serie', inv.numeroSerie), dup('Número de activo', inv.numeroActivo), dup('Folio interno', inv.folioInterno),
    dup('Folio de factura', d.compras.folioFactura),
  ]), '')

  out.push('## Referencias rotas', '', kv(d.referenciasRotas), '')
  out.push('## Usuarios', '', kv({ Total: d.usuarios.total, 'Sin número de empleado': d.usuarios.sinNumeroEmpleado, Deshabilitados: d.usuarios.deshabilitados }), '')
  const p = d.compras
  out.push('## Compras', '', kv({
    'Órdenes de compra': p.ordenesCompra, 'Órdenes sin proveedor': p.ordenesSinProveedor, Facturas: p.facturas,
    'Facturas sin PDF': p.facturasSinPdf, 'Facturas sin XML': p.facturasSinXml, 'Facturas sin proveedor': p.facturasSinProveedor,
    'Facturas sin orden de compra': p.facturasSinOrden,
  }), '')
  const r = d.resguardos
  out.push('## Resguardos', '', table(['Estado', 'Resguardos'], Object.entries(r.porEstado)), '', kv({
    'Con PDF': r.conPdf, 'Con firma de receptor': r.conFirmaReceptor, 'Con firma de entregador': r.conFirmaEntregador,
    'Firmas como data URL': r.firmasDataUrl, Artículos: r.articulos, 'Inventarios con resguardo': r.inventariosConResguardo,
  }), '')
  out.push('## Bitácora', '', table(['Entidad', 'Registros'], Object.entries(d.bitacora.porEntidad)), '',
    table(['Acción', 'Registros'], Object.entries(d.bitacora.porAccion)), '')
  out.push('## Tipos MIME registrados', '', table(['Tabla', 'Tipo', 'Filas'],
    Object.entries(d.tiposMime).flatMap(([t, m]) => Object.entries(m).map(([k, n]) => [t, k, n]))), '')

  out.push('## Archivos', '', kv({
    'Referencias en BD': a.referenciasTotales, 'Referencias únicas': a.referenciasUnicas, 'Referencias no interpretables': a.referenciasNoInterpretables,
  }), '', table(['Formato de ruta', 'Referencias'], Object.entries(a.formatosDeRuta)), '')
  if (!l) {
    out.push('_Sin listado de archivos (`--listing`): no se cruzó BD contra disco._', '')
  } else {
    out.push(kv({
      'Archivos en disco': l.archivos, 'Bytes en disco': bytes(l.bytesTotales), Miniaturas: l.miniaturas,
      'Referenciados que faltan en disco': l.referenciadosFaltantes, 'Huérfanos (en disco sin referencia)': l.huerfanos,
      'Bytes huérfanos': bytes(l.bytesHuerfanos), 'Mayores de 10 MB': l.mayoresDe10MB, 'Mayores de 50 MB': l.mayoresDe50MB,
      'Errores del listado': JSON.stringify(l.erroresListado),
    }), '', '### Histograma de tamaños', '',
    table(['Rango', 'Archivos', 'Bytes'], Object.entries(l.histogramaTamanos).map(([k, v]) => [k, v.archivos, bytes(v.bytes)])), '',
    '### Por carpeta', '',
    table(['Carpeta', 'Bytes', 'Faltantes', 'Huérfanos'], Object.keys({ ...l.bytesPorCarpeta, ...l.faltantesPorCarpeta }).sort()
      .map((k) => [k, bytes(l.bytesPorCarpeta[k] ?? 0), l.faltantesPorCarpeta[k] ?? 0, l.huerfanosPorCarpeta[k] ?? 0])), '',
    '### Faltantes por origen', '',
    table(['Origen', 'Referencias', 'Faltantes'], Object.entries(l.faltantesPorOrigen).map(([k, v]) => [k, v.referencias, v.faltantes])), '',
    '### Extensiones', '', table(['Extensión', 'Archivos'], Object.entries(l.extensiones).sort((x, y) => y[1] - x[1])), '')
  }
  return `${out.join('\n')}\n`
}
