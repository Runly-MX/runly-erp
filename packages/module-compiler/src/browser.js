// No filesystem, ZIP implementation, Node crypto or ERP application imports.
export * from './definition.js'
export { assignFieldIds, uuidv7 } from './field-ids.js'
export { EXTERNAL_RELATION_TARGETS, externalTarget, connectionTarget } from './external-relations.js'
export { DEFINITION_FILE, EXTENSIONS_MAX_BYTES, hasExtensions, isExtensionFilePath } from './extensions.js'
export * from './contracts.js'
export { AUTOMATIC_ARGS, AUTOMATION_ARG_SOURCES, CONDITION_OPS, MAX_AUTOMATIONS, MAX_CONDITIONS, MAX_STEPS, RECORD_TRIGGER_ON, automationEvents, automationServiceKeys, automationServices, conditionsOf, stepsOf, validateSystemAutomation, isDelayStep, isHttpStep, isApprovalStep, isServiceStep, isPauseStep, DELAY_UNITS, MAX_DELAYS, MAX_APPROVERS, HTTP_METHODS, SCHEDULE_EVERY } from './automations.js'
export { previewAutomation } from './automations-preview.js'
export { SERVICE_CONTRACTS } from '@runly/module-engine/contracts'

export { inboundRelations, onDisableOf, resolveLabelField, isSameModuleRelation, validateRelations } from './relations.js'
