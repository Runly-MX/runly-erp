// Preserve meaningful false/zero and an explicitly missing row. Never treat
// {data:null} as if it were a valid settings record.
export function selectPosSettings(response) {
  return response && Object.hasOwn(response, 'data') ? response.data : response ?? null
}

// General and Avanzado edit different fields. A save must not rewrite fields
// that the operator did not edit (including values hidden on another tab).
export function settingsPatch(part, { mode, tipsEnabled, taxRate }) {
  const patch = {}
  if (part === 'general') {
    if (mode !== null) {
      if (!['RETAIL', 'RESTAURANT', 'HYBRID'].includes(mode)) throw new Error('Selecciona una modalidad válida.')
      patch.mode = mode
    }
    if (tipsEnabled !== null) patch.tipsEnabled = tipsEnabled
  } else if (taxRate !== null) {
    const value = String(taxRate).trim()
    if (!value || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100) throw new Error('Escribe una tasa de impuesto entre 0 y 100.')
    patch.defaultTaxRate = Number(value)
  }
  return patch
}
