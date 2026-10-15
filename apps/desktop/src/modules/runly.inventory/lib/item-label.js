// An item's asset number is optional (legacy imports leave it empty on purpose):
// never print "(null)" or "(undefined)".
export const itemLabel = (item) => {
  const name = String(item?.name ?? '').trim()
  const tag = String(item?.assetTag ?? '').trim()
  return tag ? `${name} (${tag})` : name
}
