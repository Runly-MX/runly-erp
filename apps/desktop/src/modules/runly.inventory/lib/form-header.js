import { itemLabel } from './item-label.js'

const LIST_PATH = '/app/m/runly.inventory/inventory'

// Header model of the create/edit screen: breadcrumb trail, title and subtitle.
// Edit mode shows the item's name in the trail and its serial in the subtitle.
export function formHeaderModel({ isEdit, item = null, id = null }) {
  const root = { label: 'Inventario', to: LIST_PATH }
  if (!isEdit) {
    return { title: 'Nuevo activo', subtitle: 'Completa la información del activo', crumbs: [root, { label: 'Nuevo activo' }] }
  }
  const name = String(item?.name ?? '').trim() || 'Activo'
  const serial = String(item?.serialNumber ?? '').trim()
  const tag = String(item?.assetTag ?? '').trim()
  const subtitle = [name, serial && `Serie ${serial}`, tag && `N.º de activo ${tag}`].filter(Boolean).join(' · ')
  return {
    title: 'Editar activo',
    subtitle: item ? subtitle : '',
    crumbs: [root, { label: itemLabel(item) || name, to: id ? `${LIST_PATH}/${id}` : undefined }, { label: 'Editar' }],
  }
}
