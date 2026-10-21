// What a supplier may do with an item given its administrative status. Suppliers only register items
// (the team confirms the alta) and PROPOSE a baja; they can never confirm, approve, reject or revert.
// The API enforces the same rules (409 ADMIN_STATUS_LOCKED on edits of locked items).
const LOCKED = new Set(['deregistered'])

export function guestItemActions({ canWrite = false, adminStatus = null } = {}) {
  const locked = LOCKED.has(adminStatus)
  const banner = adminStatus === 'deregistration_proposed'
    ? { tone: 'warning', text: 'Baja propuesta: pendiente de revisión del equipo. Mientras tanto puedes seguir editando el item.' }
    : adminStatus === 'deregistered'
      ? { tone: 'default', text: 'Este item fue dado de baja y es de solo lectura.' }
      : adminStatus === 'registration_pending'
        ? { tone: 'default', text: 'Propuesta de alta: el equipo debe confirmarla. Puedes seguir editando el item mientras tanto.' }
        : null
  return {
    canEdit: Boolean(canWrite) && !locked,
    canProposeDeregistration: Boolean(canWrite) && adminStatus === 'registered',
    locked,
    banner,
  }
}

// Reasons a supplier can pick for a proposed baja (same enum as the main admin transition).
export const buildProposeBody = (reason) => ({ reason })
