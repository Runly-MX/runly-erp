// Who may see and grade the results of one evaluation (spec 2026-11-21 section
// 9, phase 5). Enforced on every results, record, file and grading call.
//  - manager: company admin or lms.course.manage. Everything, including the
//    reviewer list.
//  - grader: lms.grade. Without reviewer rows, every lms.grade holder of the
//    company; with rows, only the people listed as grader.
//  - reader: lms.assessment.results (read results, records and files, export).
//    Same rule: with rows, only the people listed.
// Anyone else gets 403; an evaluation of another company is 404.
import { LmsError } from './lms-error.js'

export const ROLE_RANK = { reader: 1, grader: 2, manager: 3 }
const need = { read: 1, grade: 2, manage: 3 }

// user: { profileId, isAdmin, permissions: Set }
export function userFrom(c) {
  const ctx = c.get('userContext') ?? {}
  return { profileId: ctx.profile?.id ?? null, isAdmin: ctx.isAdmin === true, permissions: ctx.permissionSet ?? new Set() }
}

// Pure: the role for a user given the evaluation's reviewer rows.
export function resolveRole(user, members = []) {
  const has = (key) => user.isAdmin || user.permissions.has(key)
  if (has('lms.course.manage')) return 'manager'
  const canGrade = has('lms.grade'), canRead = has('lms.assessment.results')
  if (members.length) {
    const mine = members.find((row) => row.userProfileId === user.profileId)
    if (!mine) return null
    if (mine.role === 'grader' && canGrade) return 'grader'
    return canGrade || canRead ? 'reader' : null
  }
  if (canGrade) return 'grader'
  return canRead ? 'reader' : null
}

export function createLmsAssessmentAccess({ prisma }) {
  async function assessmentOf(companyId, assessmentId) {
    const row = await prisma.lmsCourse.findFirst({ where: { id: assessmentId, companyId, enabled: true, kind: 'assessment' } })
    if (!row) throw new LmsError('La evaluación no existe.', 404)
    return row
  }

  // { assessment, role } or throws 403 when the role is below `level`.
  async function require(companyId, user, assessmentId, level = 'read') {
    const assessment = await assessmentOf(companyId, assessmentId)
    const members = await prisma.lmsCourseGrader.findMany({ where: { courseId: assessment.id } })
    const role = resolveRole(user, members)
    if (!role || ROLE_RANK[role] < need[level]) {
      throw new LmsError(level === 'grade' ? 'No estás autorizado para calificar esta evaluación.' : 'No estás autorizado para ver los resultados de esta evaluación.', 403, 'NOT_A_REVIEWER')
    }
    return { assessment, role }
  }

  // Evaluations of the company this user may open results for.
  async function accessible(companyId, user) {
    const rows = await prisma.lmsCourse.findMany({ where: { companyId, enabled: true, kind: 'assessment', status: { not: 'draft' } }, include: { graders: true }, orderBy: { updatedAt: 'desc' } })
    return rows.map((row) => ({ row, role: resolveRole(user, row.graders) })).filter((item) => item.role)
  }

  return { require, accessible, assessmentOf }
}
