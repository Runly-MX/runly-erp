// Chat services for modules and company automations: post a message to a channel.
// The message is labelled with the module (or automation) that sent it, never with
// a person, and never triggers automations (no loops). Spec
// docs/superpowers/specs/2026-10-26-slack-parity-design.md, section 1.
import { createChatIntegrationsService } from '../../routes/chat/chat-integrations-service.js'
import { ChatServiceError } from '../../routes/chat/chat-service-error.js'

// `buttons` arrives as JSON text: [{ "label": "Abrir", "url": "https://..." }].
function parseButtons(value) {
  try { const parsed = JSON.parse(String(value ?? '')); return Array.isArray(parsed) ? parsed : [] } catch { return [] }
}

export function createChatHandlers({ prisma, ServiceError, broadcaster = null }) {
  const chat = createChatIntegrationsService({ prisma, broadcaster })

  // "Compras", "Mi módulo": the name members know it by.
  async function sourceName(moduleKey) {
    const row = await prisma.runlyModule?.findFirst?.({ where: { key: moduleKey }, select: { name: true } }).catch(() => null)
    return row?.name || moduleKey || 'Integración'
  }

  return {
    'runly.chat:messages.post': async ({ companyId, moduleKey }, args) => {
      try {
        return await chat.postFromService({
          companyId,
          channel: args.channel,
          source: { kind: 'module', name: await sourceName(moduleKey) },
          input: { text: args.text, title: args.title, link: args.link, buttons: parseButtons(args.buttons), approvalId: args.approvalId },
        })
      } catch (error) {
        if (error instanceof ChatServiceError) throw new ServiceError(error.message, error.status, 'chat_post_failed')
        throw error
      }
    },
  }
}
