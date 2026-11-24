// Isolated backend extension of the reference fixture: summarizes the
// company's requests by state. It only sees what the gateway returns for the
// company and user the host put in its call token.
export default async function resumen({ capabilities }) {
  const records = await capabilities.call('records.list', { entity: 'solicitud', limit: 100 })
  const porEstado = {}
  let montoAprobado = 0
  for (const record of records) {
    porEstado[record.data.estado] = (porEstado[record.data.estado] ?? 0) + 1
    if (record.data.estado === 'aprobada') montoAprobado += record.data.monto ?? 0
  }
  return { total: records.length, porEstado, montoAprobado }
}
