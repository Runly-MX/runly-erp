import { BLUEPRINT_KINDS, FIELD_TYPES, MODULE_KINDS } from './constants.js'
import { EVENT_CATALOG } from './event-catalog.js'

export const RME3_CONTRACT_VERSION = 1
export const RME3_ENGINE_VERSION = '0.1.0'
// Shared metadata only. Handlers remain inside the ERP API.
export { SERVICE_CONTRACTS, SERVICE_KEYS, IDEMPOTENCY_ARG, validateServiceArgs } from './service-contracts.js'
export { createServiceSimulator, SimulatedServiceError } from './service-simulator.js'
export { EVENT_CATALOG } from './event-catalog.js'
// Derived from the catalog (labels and payload keys); see event-catalog.js for the data each event carries.
export const DOMAIN_EVENTS = Object.freeze(Object.fromEntries(Object.entries(EVENT_CATALOG).map(([key, entry]) => [key, entry.label])))
export const DOMAIN_EVENT_PAYLOADS = Object.freeze(Object.fromEntries(Object.entries(EVENT_CATALOG).map(([key, entry]) => [key, Object.freeze(entry.fields.map((item) => item.key))])))

export const RME3_ENGINE_CONTRACT = Object.freeze({
  schemaVersion: RME3_CONTRACT_VERSION,
  engineVersion: RME3_ENGINE_VERSION,
  declarationFormat: 'rme3-js-literals-v1',
  fieldTypes: Object.freeze(Object.values(FIELD_TYPES)),
  blueprintKinds: Object.freeze(Object.values(BLUEPRINT_KINDS)),
  moduleKinds: Object.freeze(Object.values(MODULE_KINDS)),
  legacyAlias: '@atlas/module-engine',
})

export { isEmpty, matches, render, sourceValue, buildArgs, clip, safe, runSteps, runEntry, execute } from './automation-runtime.js'
