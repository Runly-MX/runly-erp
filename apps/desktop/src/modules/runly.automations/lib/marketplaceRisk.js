// Presentation of the server's risk report for a Marketplace automation (E3a contract). It never
// reads or shows argument values, HTTP URLs beyond the host, or bodies: those can hold data the
// server cannot recognize as secret. It does not change the definition either (the server cleans it).
import { automationServices, isApprovalStep, isBranchStep, isDelayStep, isHttpStep, isLoopStep } from '@runly/module-compiler/browser'

const REMOVED = {
  people: ['persona', 'personas'], externalEmails: ['correo externo', 'correos externos'], chatChannels: ['canal de chat', 'canales de chat'],
  fileIds: ['archivo', 'archivos'], contactIds: ['contacto', 'contactos'], templateIds: ['plantilla', 'plantillas'], recordIds: ['registro', 'registros'],
}
const TRIGGERS = { webhook: 'Cuando otro sistema envía datos (webhook)', event: 'Cuando pasa algo en un módulo', schedule: 'En un horario', date: 'En una fecha de un registro' }
const ARG = { userIds: 'destinatarios', attendeeIds: 'asistentes', assigneeId: 'responsable', to: 'destinatario', channel: 'canal', fileId: 'archivo', templateId: 'plantilla', id: 'registro' }

let labels
export function serviceLabel(key) {
  labels ??= new Map(automationServices({ trigger: 'event' }).map((row) => [row.key, row.label]))
  return labels.get(key) ?? key
}

// "automations[0].steps[1].args.userIds" -> "Bloque 2: falta elegir destinatarios"
export function pendingLabel(row) {
  const step = /steps\[(\d+)\]/.exec(row?.path ?? '')?.[1], arg = /args\.(\w+)/.exec(row?.path ?? '')?.[1]
  const where = step != null ? `Bloque ${Number(step) + 1}` : 'Un bloque'
  return arg ? `${where}: falta elegir ${ARG[arg] ?? arg}` : `${where}: falta completar datos`
}

export function riskSections(report) {
  const fileRisk = report?.fileRisk ?? {}
  const removed = Object.entries(report?.removed ?? {}).filter(([key, n]) => n > 0 && REMOVED[key]).map(([key, n]) => ({ key, count: n, text: `${n} ${REMOVED[key][n === 1 ? 0 : 1]}` }))
  const flags = [
    fileRisk.hasChatChannels && 'Publica en canales de chat',
    fileRisk.hasAttachments && 'Usa archivos adjuntos',
    fileRisk.hasApprovals && 'Pide aprobaciones a personas',
  ].filter(Boolean)
  return {
    trigger: TRIGGERS[report?.trigger] ?? 'Disparador',
    services: (report?.services ?? []).map((key) => ({ key, label: serviceLabel(key) })),
    httpHosts: report?.httpHosts ?? [],
    externalEmails: Number(fileRisk.externalEmailCount ?? 0),
    removed, flags,
    errors: report?.errors ?? [],
    pending: (report?.needsConfiguration ?? []).map(pendingLabel),
    notes: report?.notes ?? [],
    blocked: (report?.errors ?? []).length > 0,
  }
}

// One line per top-level block of the cleaned definition, without any value.
export function stepSummary(definition) {
  return (definition?.steps ?? []).map((step, index) => {
    const n = `Bloque ${index + 1}`
    if (isHttpStep(step)) { let host = ''; try { host = new URL(String(step.url)).host } catch { /* malformed: the server reports it */ } return { key: index, text: `${n}: llamar a ${host || 'una URL'}`, http: true } }
    if (isApprovalStep(step)) return { key: index, text: `${n}: pedir aprobación` }
    if (isDelayStep(step)) return { key: index, text: `${n}: esperar` }
    if (isBranchStep(step)) return { key: index, text: `${n}: condición` }
    if (isLoopStep(step)) return { key: index, text: `${n}: repetir para cada registro` }
    if (step?.service) return { key: index, text: `${n}: ${serviceLabel(step.service)}` }
    return { key: index, text: `${n}: ${step?.type ?? 'acción'}` }
  })
}

// The consent sent back is exactly what the server prepared: its digest and its service list.
export const consentFor = (prepared) => ({ definitionDigest: prepared.definitionDigest, services: [...prepared.services], acceptRisks: true })
