// Services of the chat's calls for modules and company automations: transcribe a
// recording, list who attended and write the minuta (spec
// docs/superpowers/specs/2026-10-31-automations-calls-chat-autoreply-design.md §A).
// An automation (system) acts for the company; a person calling from a module must be
// a member of the call's conversation.
import { createCallTranscriptService } from '../../routes/calls/call-transcript-service.js'
import { createCallTranscriptDocumentService } from '../../routes/calls/call-transcript-document-service.js'
import { createCallMinutesService, listCallParticipants } from '../../routes/calls/call-minutes-service.js'

export function createCallsHandlers({ prisma, ServiceError, filesService = null }) {
  const transcripts = createCallTranscriptService({ prisma })
  const documents = createCallTranscriptDocumentService({ prisma })
  const minutes = createCallMinutesService({ prisma, filesService, documents })

  // Errors of the calls services carry a status: keep it (a 4xx is not retried).
  async function guard(fn) {
    try {
      return await fn()
    } catch (error) {
      if (error instanceof ServiceError || !error?.status) throw error
      throw new ServiceError(error.message, error.status, 'calls_failed')
    }
  }

  async function assertAccess(ctx, conversationId) {
    if (ctx.system) return
    const [member] = await prisma.$queryRaw`SELECT 1 AS ok FROM chat_conversation_members WHERE conversation_id = ${conversationId}::uuid AND user_id = ${ctx.actorId}::uuid AND left_at IS NULL LIMIT 1`
    if (!member) throw new ServiceError('La llamada no existe.', 404, 'not_found')
  }

  async function callOf(companyId, callId) {
    const call = await prisma.call.findUnique({ where: { id: callId }, select: { id: true, conversationId: true, initiatedByUserId: true } })
    const [conversation] = call ? await prisma.$queryRaw`SELECT company_id FROM chat_conversations WHERE id = ${call.conversationId}::uuid LIMIT 1` : []
    if (!call || String(conversation?.company_id ?? '') !== String(companyId)) throw new ServiceError('La llamada no existe.', 404, 'not_found')
    return call
  }

  return {
    // Asked on behalf of a current member: whoever recorded it, else whoever started the call.
    'runly.calls:transcripts.request': (ctx, { callId }) => guard(async () => {
      const call = await callOf(ctx.companyId, callId)
      await assertAccess(ctx, call.conversationId)
      const recording = await prisma.callRecording.findFirst({ where: { callId, status: 'READY' }, orderBy: { startedAt: 'desc' }, select: { startedByUserId: true } })
      if (!recording) throw new ServiceError('Esta llamada no tiene una grabación lista para transcribir.', 422, 'no_recording')
      const preferred = ctx.system ? [recording.startedByUserId, call.initiatedByUserId] : [ctx.actorId]
      const members = await prisma.$queryRaw`SELECT user_id FROM chat_conversation_members WHERE conversation_id = ${call.conversationId}::uuid AND left_at IS NULL AND user_id IS NOT NULL`
      const ids = members.map((row) => String(row.user_id))
      const requester = preferred.find((id) => ids.includes(String(id))) ?? (ctx.system ? ids[0] : null)
      if (!requester) throw new ServiceError('Nadie de la conversación puede pedir la transcripción.', 409, 'no_member')
      const result = await transcripts.requestTranscript({ callId, requestedByUserId: requester, profileId: requester })
      return { id: result.id, status: result.status, callId }
    }),
    'runly.calls:participants.search': (ctx, { callId, scope = 'all', limit = 50 }) => guard(async () => {
      const call = await callOf(ctx.companyId, callId)
      await assertAccess(ctx, call.conversationId)
      const { items } = await listCallParticipants(prisma, { companyId: ctx.companyId, callId, scope })
      return { items: items.slice(0, limit), total: items.length }
    }),
    'runly.calls:minutes.generate': (ctx, { transcriptId, mode = 'auto', sourceEntityId = null }) => guard(async () => {
      const transcript = await prisma.callTranscript.findFirst({ where: { id: transcriptId, companyId: ctx.companyId }, select: { conversationId: true } })
      if (!transcript) throw new ServiceError('La transcripción no existe.', 404, 'not_found')
      await assertAccess(ctx, transcript.conversationId)
      return minutes.generate({ companyId: ctx.companyId, transcriptId, mode, source: { moduleKey: ctx.moduleKey, sourceEntityId } })
    }),
  }
}
