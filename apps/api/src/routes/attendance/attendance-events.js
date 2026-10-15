// Live updates for runly.attendance: one place that tells open admin screens to
// refetch (company events channel) and notifies the people who review requests.
import { COMPANY_ADMIN_ROLE_KEYS, SYSTEM_ADMIN_ROLE_KEYS } from '../../lib/tenant-context.js'

const REVIEWER_PERMISSIONS = new Set(['attendance.punch.manage', 'attendance.config.manage'])

export function createAttendanceEvents({ prisma = null, broadcaster = null, notificationService = null } = {}) {
  // Fire-and-forget: a failed broadcast must never fail the write that caused it.
  function changed(companyId, action, extra = {}) {
    if (!companyId) return
    Promise.resolve(broadcaster?.broadcastToCompany?.(companyId, 'attendance.changed', { action, ...extra })).catch(() => {})
  }

  async function reviewerUserIds(companyId) {
    const memberships = await prisma.membership.findMany({
      where: { companyId, enabled: true, company: { enabled: true } },
      include: { role: { include: { permissions: { include: { permission: { select: { key: true } } } } } } },
    })
    return [...new Set(memberships
      .filter((m) => m.role?.enabled !== false)
      .filter((m) => COMPANY_ADMIN_ROLE_KEYS.has(m.role?.key) || SYSTEM_ADMIN_ROLE_KEYS.has(m.role?.key)
        || (m.role?.permissions ?? []).some((rp) => REVIEWER_PERMISSIONS.has(rp.permission?.key)))
      .map((m) => m.userId))]
  }

  // A person asked for a forgotten punch: tell everyone who can resolve it.
  async function correctionRequested({ companyId, correction, person }) {
    changed(companyId, 'correction', { id: correction.id })
    if (!notificationService?.publish || !prisma) return
    try {
      const userIds = await reviewerUserIds(companyId)
      if (!userIds.length) return
      const name = [person.firstName, person.lastName].filter(Boolean).join(' ') || person.code
      await notificationService.publish({
        companyId,
        input: {
          eventType: 'attendance.correction.requested',
          title: 'Nueva solicitud de checada',
          body: `${name} pidió registrar una ${correction.direction === 'out' ? 'salida' : 'entrada'} olvidada.`,
          link: '/app/m/runly.attendance/requests',
          recipients: { userIds },
          channels: ['in_app', 'web_push'],
          priority: 'medium',
          sourceType: 'attendance_correction',
          sourceId: correction.id,
          dedupeKey: `attendance.correction.requested:${correction.id}`,
        },
      })
    } catch { /* the request is already stored; the screens still refresh */ }
  }

  return { changed, correctionRequested }
}
