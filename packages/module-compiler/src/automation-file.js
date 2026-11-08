// Portable automation file (`*.runly-automation.json`): parse, clean, export and risk
// summary. PURE: no DOM, no Node APIs, no persistence, no execution. Used by the desktop
// editor and by the Developer Hub validator, so both read exactly the same format.
//
// The file carries the flow only: no ids, no secret webhook URL and, once cleaned, no
// people or references that belong to the company that exported it. An imported
// definition is ALWAYS paused (enabled:false): this module enforces it and the server
// that saves it must enforce it again.
import { SERVICE_CONTRACTS } from '@runly/module-engine/contracts'
import { AUTOMATIC_ARGS, isApprovalStep, isHttpStep, serviceStepsOf, stepsOf, validateSystemAutomation } from './automations.js'

export const AUTOMATION_FILE = Object.freeze({ format: 'runly.automation', version: 1, maxBytes: 200 * 1024 })

// Technical recommendation (D-E4 / D-E6 are product decisions, not approved here): drop
// everything that belongs to the exporting company. Each axis can be turned off by the
// caller without changing this API. `recordIds` extends the Annex A list: any other
// record id typed into a step is meaningless in another company.
export const DEFAULT_CLEANUP = Object.freeze({ people: true, externalEmails: true, chatChannels: true, fileIds: true, contactIds: true, templateIds: true, recordIds: true })
const REMOVED_KEYS = ['people', 'externalEmails', 'chatChannels', 'fileIds', 'contactIds', 'templateIds', 'recordIds']
const PEOPLE_ARGS = ['userIds', 'attendeeIds', 'assigneeId']
const STORED_ONLY = ['id', 'key', 'updatedAt', 'lastRun', 'webhookToken']
const EMAIL_SERVICE = 'runly.notifications:email.send'
const CHAT_POST = 'runly.chat:messages.post'

const deepCopy = (value) => JSON.parse(JSON.stringify(value))
const encoder = new TextEncoder()

// The definition without what belongs to one stored row.
export function definitionOf(item) {
  const copy = deepCopy(item)
  for (const field of STORED_ONLY) delete copy[field]
  return copy
}

export function exportAutomationFile(definition, { exportedAt } = {}) {
  if (typeof exportedAt !== 'string' || Number.isNaN(Date.parse(exportedAt))) throw new TypeError('EXPORTED_AT_REQUIRED')
  const { label, ...rest } = definitionOf(definition)
  return { format: AUTOMATION_FILE.format, version: AUTOMATION_FILE.version, exportedAt, automation: { label, ...rest, enabled: false } }
}

const fromValue = (arg) => arg && typeof arg === 'object' && arg.from === 'value'
const hasContent = (arg) => (Array.isArray(arg.value) ? arg.value.length > 0 : arg.value !== undefined && arg.value !== null && arg.value !== '')
const argType = (service, name) => SERVICE_CONTRACTS[service]?.args?.[name]?.type

// Which cleanup axis an argument of a step belongs to (null: nothing to clean).
function axisOf(service, name) {
  if (PEOPLE_ARGS.includes(name)) return 'people'
  if (name === 'fileId') return 'fileIds'
  if (name === 'templateId') return 'templateIds'
  if (name === 'channel' && service === CHAT_POST) return 'chatChannels'
  if (name === 'to' && service === EMAIL_SERVICE) return 'externalEmails'
  if (name === 'id' && service?.startsWith('runly.contacts:')) return 'contactIds'
  if (AUTOMATIC_ARGS.includes(name)) return null
  const type = argType(service, name)
  return type === 'uuid' || type === 'uuid[]' ? 'recordIds' : null
}

function cleanStep(step, options, removed) {
  if (!step || typeof step !== 'object') return step
  let next = step
  if (isApprovalStep(step)) {
    next = { ...step }
    if (options.people && next.approvers?.length) { next.approvers = []; removed.people += 1 }
    if (options.chatChannels && typeof next.channel === 'string' && next.channel.trim()) { delete next.channel; removed.chatChannels += 1 }
    return next
  }
  if (step.args && typeof step.args === 'object') {
    const args = { ...step.args }
    for (const name of Object.keys(args)) {
      const axis = axisOf(step.service, name)
      if (!axis || !options[axis] || !fromValue(args[name]) || !hasContent(args[name])) continue
      delete args[name]
      removed[axis] += 1
    }
    next = { ...step, args }
  }
  if (Array.isArray(step.do)) next = { ...next, do: step.do.map((child) => cleanStep(child, options, removed)) }
  return next
}

export function cleanAutomation(definition, cleanup = DEFAULT_CLEANUP) {
  const options = { ...Object.fromEntries(REMOVED_KEYS.map((key) => [key, false])), ...cleanup }
  const removed = Object.fromEntries(REMOVED_KEYS.map((key) => [key, 0]))
  const copy = deepCopy(definition)
  if (Array.isArray(copy.steps)) copy.steps = copy.steps.map((step) => cleanStep(step, options, removed))
  else if (copy.action) copy.action = cleanStep(copy.action, options, removed)
  return { definition: copy, removed }
}

const sortedUnique = (list, max) => [...new Set(list)].sort().slice(0, max)

// Closed schema of PUBLIC_PROJECTIONS_CONTRACT_V1 section 4.2. It describes what the FILE asks
// for; `importsPaused` is true because every import through this module yields enabled:false.
export function riskSummary(definition) {
  const steps = serviceStepsOf(definition)
  const hosts = []
  for (const step of stepsOf(definition)) {
    if (!isHttpStep(step)) continue
    try { hosts.push(new URL(String(step.url)).host) } catch { /* the validator reports malformed URLs */ }
  }
  const emails = steps.filter((step) => step.service === EMAIL_SERVICE && fromValue(step.args?.to) && typeof step.args.to.value === 'string').map((step) => step.args.to.value.trim().toLowerCase())
  const all = stepsOf(definition)
  return {
    services: sortedUnique(steps.map((step) => step.service).filter(Boolean), 100),
    httpHosts: sortedUnique(hosts, 50),
    externalEmailCount: new Set(emails.filter(Boolean)).size,
    hasChatChannels: steps.some((step) => step.service === CHAT_POST) || all.some((step) => isApprovalStep(step) && typeof step.channel === 'string' && step.channel.trim() !== ''),
    hasAttachments: steps.some((step) => step.args && Object.hasOwn(step.args, 'fileId')),
    hasApprovals: all.some(isApprovalStep),
    importsPaused: true,
  }
}

export const validateAutomationDefinition = validateSystemAutomation

const fail = (code, message) => ({ ok: false, errors: [{ code, message }], warnings: [], definition: null, removed: Object.fromEntries(REMOVED_KEYS.map((key) => [key, 0])), riskSummary: null })

// bytes or text of a file -> { ok, errors, warnings, definition (paused, no key), removed, riskSummary }.
export function parseAutomationFile(input, { cleanup = DEFAULT_CLEANUP } = {}) {
  let text
  if (typeof input === 'string') {
    // Measured in UTF-8 bytes, never in UTF-16 code units.
    if (encoder.encode(input).length > AUTOMATION_FILE.maxBytes) return fail('file_too_large', 'El archivo es demasiado grande para ser una automatización.')
    text = input
  } else if (input instanceof Uint8Array) {
    if (input.length > AUTOMATION_FILE.maxBytes) return fail('file_too_large', 'El archivo es demasiado grande para ser una automatización.')
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(input) } catch { return fail('invalid_json', 'El archivo no es un JSON válido.') }
  } else throw new TypeError('INPUT_MUST_BE_TEXT_OR_BYTES')
  let data
  try { data = JSON.parse(text) } catch { return fail('invalid_json', 'El archivo no es un JSON válido.') }
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.format !== AUTOMATION_FILE.format) return fail('not_automation_file', 'Este archivo no es una automatización de Runly.')
  if (!Number.isInteger(data.version) || data.version < 1) return fail('file_version_invalid', 'El archivo no indica una versión válida.')
  if (data.version > AUTOMATION_FILE.version) return fail('file_version_newer', 'El archivo es de una versión más nueva de Runly. Actualiza Runly para importarlo.')
  const automation = data.automation
  if (!automation || typeof automation !== 'object' || typeof automation.label !== 'string' || !automation.trigger || !Array.isArray(automation.steps)) return fail('automation_incomplete', 'Al archivo le falta el disparador o los bloques.')
  const original = definitionOf(automation)
  const { definition: cleaned, removed } = cleanAutomation(original, cleanup)
  const label = automation.label.trim().slice(0, 120) || 'Automatización importada'
  const definition = { ...cleaned, label, enabled: false }
  // Cleaning can leave steps incomplete on purpose: report them, do not reject the file.
  // The key is assigned by whoever saves it: validate with a stand-in so only real problems are reported.
  const warnings = validateSystemAutomation({ ...definition, key: 'importada' }).slice(0, 10).map((d) => ({ code: 'definition_check', message: `${d.path}: ${d.message}` }))
  return { ok: true, errors: [], warnings, definition, removed, riskSummary: riskSummary(original) }
}
