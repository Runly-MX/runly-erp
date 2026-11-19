export const MUTED_TEXT = 'text-xs text-[hsl(var(--muted-foreground))]'
export const BOOKINGS_BASE = '/app/m/runly.bookings'
export const bookingsPath = (subPath = '') => `${BOOKINGS_BASE}${subPath}`

export const STATUS = {
  PENDING: { label: 'Pendiente', tone: 'warning' },
  CONFIRMED: { label: 'Confirmada', tone: 'brand' },
  CANCELLED: { label: 'Cancelada', tone: 'neutral' },
  REJECTED: { label: 'Rechazada', tone: 'danger' },
  COMPLETED: { label: 'Completada', tone: 'success' },
  NO_SHOW: { label: 'No presentada', tone: 'danger' },
  EXPIRED: { label: 'Expirada', tone: 'neutral' },
}
export const STATUS_OPTIONS = Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }))

export const MODE = { internal: 'Interno', online: 'Online', hybrid: 'Híbrido' }
export const MODE_HINT = {
  internal: 'Solo tu equipo registra reservaciones desde el ERP.',
  online: 'Pensado para que los clientes reserven solos cuando se habilite la publicación.',
  hybrid: 'Tu equipo y, cuando se habilite la publicación, los clientes.',
}
export const KIND = { appointment: 'Cita individual', session: 'Sesión con cupo' }
export const RESOURCE_TYPE = { staff: 'Persona', room: 'Sala o espacio', equipment: 'Equipo', table: 'Mesa', other: 'Otro' }
export const ROLE = { admin: 'Administrador', agent: 'Agente', viewer: 'Lector' }
export const ROLE_HINT = {
  admin: 'Configura el sistema y opera reservaciones.',
  agent: 'Crea, confirma, reprograma y cancela reservaciones.',
  viewer: 'Solo consulta agenda y reservaciones.',
}
export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

export const ACTIONS = {
  confirm: { label: 'Confirmar', done: 'Reservación confirmada.' },
  reject: { label: 'Rechazar', done: 'Reservación rechazada.', destructive: true, confirm: 'La reservación se rechaza y su horario queda libre.' },
  cancel: { label: 'Cancelar reservación', done: 'Reservación cancelada.', destructive: true, confirm: 'La reservación se cancela y su horario queda libre.' },
  complete: { label: 'Marcar completada', done: 'Reservación completada.' },
  'no-show': { label: 'No se presentó', done: 'Marcada como no presentada.', destructive: true, confirm: 'La reservación se marca como no presentada y su horario queda libre.' },
  reschedule: { label: 'Reprogramar' },
}

export const optionsOf = (map) => Object.entries(map).map(([value, label]) => ({ value, label }))

// Engine error codes -> what the person should understand and do.
const CODE_MESSAGES = {
  SLOT_TAKEN: 'Ese horario acaba de ocuparse. Elige otro horario.',
  SESSION_FULL: 'La sesión ya no tiene cupo suficiente para ese número de personas.',
  SESSION_UNAVAILABLE: 'Esa sesión ya no está disponible.',
  OUTSIDE_HOURS: 'Ese horario está fuera del horario de atención.',
  TOO_SOON: 'Ese horario ya pasó o no respeta la anticipación mínima del sistema.',
  TOO_FAR: 'Ese horario está más adelante de lo que el sistema permite reservar.',
  VERSION_CONFLICT: 'Alguien más cambió esta reservación. Vuelve a abrirla.',
  CONFLICT_RETRY: 'Otra operación cambió estos datos al mismo tiempo. Inténtalo de nuevo.',
  FORBIDDEN: 'No tienes permiso para hacer esto en este sistema.',
  NO_RESOURCES: 'El servicio no tiene recursos asignados en este sistema.',
  IDEMPOTENCY_KEY_REUSED: 'Esta solicitud ya se envió con otros datos. Cierra y vuelve a intentarlo.',
}

export function bookingsError(error, fallback = 'No se pudo completar la operación.') {
  const code = error?.code ?? error?.details?.code
  if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code]
  if (error?.status === 403) return CODE_MESSAGES.FORBIDDEN
  if (error?.status >= 500 || !error?.message) return fallback
  return error.message
}
