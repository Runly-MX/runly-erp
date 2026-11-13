import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

const valid = (v) => (v && !Number.isNaN(new Date(v).getTime()) ? new Date(v) : null)

export function relativeEdit(iso) {
  const d = valid(iso)
  return d ? formatDistanceToNow(d, { addSuffix: true, locale: es }) : ''
}

export function absoluteDate(iso) {
  const d = valid(iso)
  return d ? format(d, "d MMM yyyy, HH:mm", { locale: es }) : ''
}
