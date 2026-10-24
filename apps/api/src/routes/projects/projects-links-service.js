export class LinkServiceError extends Error {
  constructor(message, status = 500) {
    super(message)
    this.name = 'LinkServiceError'
    this.status = status
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Links a task to a record of another module. Targets are keys of the
// relation-targets catalog; that service enforces the per-type permission and
// returns the display label, so a link can only point at records the caller
// can see.
export function createLinksService({ prisma, relationTargets }) {
  async function resolveLabel({ authUserId, companyId, targetType, targetId }) {
    let found
    try {
      found = await relationTargets.resolve({ authUserId, companyId, type: targetType, ids: [targetId] })
    } catch (err) {
      if (Number.isInteger(err?.status)) throw new LinkServiceError(err.message, err.status)
      throw err
    }
    const record = found.get(String(targetId))
    if (!record) throw new LinkServiceError('Registro no encontrado.', 404)
    return record
  }

  async function listLinks(taskId, projectId) {
    const links = await prisma.taskLink.findMany({
      where: { taskId, task: { projectId } },
      orderBy: { createdAt: 'asc' },
    })
    return links
  }

  async function addLink({ taskId, projectId, companyId, userId, authUserId, targetType, targetId }) {
    if (!targetType || !UUID_RE.test(String(targetId ?? ''))) {
      throw new LinkServiceError('Registro vinculado invalido.', 400)
    }
    if (!(await prisma.task.findFirst({ where: { id: taskId, projectId }, select: { id: true } }))) {
      throw new LinkServiceError('Tarea no encontrada.', 404)
    }
    const record = await resolveLabel({ authUserId, companyId, targetType, targetId })
    const existing = await prisma.taskLink.findFirst({ where: { taskId, targetType, targetId } })
    if (existing) throw new LinkServiceError('Este registro ya esta vinculado.', 409)
    return prisma.taskLink.create({
      data: { companyId, taskId, targetType, targetId, label: record.title ?? null, createdById: userId },
    })
  }

  async function removeLink(linkId, taskId) {
    const link = await prisma.taskLink.findFirst({ where: { id: linkId, taskId } })
    if (!link) throw new LinkServiceError('Vinculo no encontrado.', 404)
    await prisma.taskLink.delete({ where: { id: linkId } })
    return link
  }

  // Tasks linked to one record, limited to projects the caller owns or belongs to.
  async function listTasksByTarget({ companyId, userId, authUserId, targetType, targetId }) {
    if (!targetType || !UUID_RE.test(String(targetId ?? ''))) {
      throw new LinkServiceError('Registro vinculado invalido.', 400)
    }
    await resolveLabel({ authUserId, companyId, targetType, targetId })
    const links = await prisma.taskLink.findMany({
      where: {
        companyId,
        targetType,
        targetId,
        task: { project: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        task: {
          select: {
            id: true, projectId: true, title: true, taskNumber: true, priority: true, dueDate: true,
            status: { select: { id: true, name: true, color: true, isDone: true } },
            project: { select: { id: true, name: true } },
          },
        },
      },
    })
    return links.map((link) => ({ linkId: link.id, ...link.task }))
  }

  return { listLinks, addLink, removeLink, listTasksByTarget }
}
