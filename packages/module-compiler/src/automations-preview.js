// "Probar" in the Module Builder: what an automation WOULD do for sample data.
// Pure: no service is called and nothing is written. Spec
// docs/superpowers/specs/2026-10-25-automation-studio-v2-stage-c-reach-design.md (C1).
import { SERVICE_CONTRACTS, buildArgs, isEmpty, matches, render, sourceValue, validateServiceArgs } from '@runly/module-engine/contracts'
import { branchLanes, conditionsOf, delayMs, stepOutputKeys, stepsOf, toRuntimeSteps } from './automations.js'

// UUID-shaped stand-ins so id arguments pass the contract checks.
const SAMPLE_ACTOR = '00000000-0000-7000-8000-00000000a001'
const SAMPLE_RECORD = '00000000-0000-7000-8000-00000000a002'

function conditionResults(when, data, previous) {
  return conditionsOf(when).map((condition) => ({
    condition,
    passes: matches(condition, data, previous),
  }))
}

function describeDelay(step) {
  const minutes = delayMs(step) / 60_000
  if (minutes % 1440 === 0) return `${minutes / 1440} día(s)`
  if (minutes % 60 === 0) return `${minutes / 60} hora(s)`
  return `${minutes} minuto(s)`
}

// A believable stand-in for a value a service step would return.
const sampleOutput = (key) => (key === 'id' || key.endsWith('Id') ? '00000000-0000-7000-8000-00000000a003' : `(${key})`)

function previewStep(step, rawStep, index, automation, context) {
  if (step.type === 'delay') return { index, kind: 'delay', summary: `Esperar ${describeDelay(rawStep)} antes de continuar` }
  if (step.type === 'approval') {
    return { index, kind: 'approval', summary: `Pedir aprobación a ${step.approvers.length} persona(s)`, message: render(step.message, context.data), approvers: step.approvers }
  }
  if (step.type === 'http') {
    const body = {}
    for (const [name, source] of Object.entries(step.body)) {
      const value = sourceValue(source, context)
      if (!isEmpty(value)) body[name] = value
    }
    return { index, kind: 'http', summary: `${step.method} ${step.url}`, method: step.method, url: step.url, body }
  }
  const contract = SERVICE_CONTRACTS[step.service]
  const args = buildArgs({ ...automation, steps: [step] }, { ...context, step: 0, idempotencyKey: null })
  const checked = contract ? validateServiceArgs(step.service, { ...args, idempotencyKey: 'preview' }) : { errors: { service: 'servicio desconocido' } }
  return {
    index, kind: 'service', summary: contract?.label ?? step.service, service: step.service, args,
    problems: Object.entries(checked.errors ?? {}).map(([name, message]) => `${name}: ${message}`),
  }
}

// automation: a definition item (v1 `action` or v2 `steps`); data: sample record or
// event payload; previous: the record before an update (for "Cambió" conditions).
export function previewAutomation(automation, { data = {}, previous = null } = {}) {
  const conditions = conditionResults(automation?.trigger?.when, data, previous)
  const passes = conditions.every((item) => item.passes)
  const runtimeSteps = toRuntimeSteps(automation)
  const rawSteps = stepsOf(automation)
  const recordId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(data?.id ?? '')) ? data.id : SAMPLE_RECORD
  const context = { data, recordId, actorId: SAMPLE_ACTOR }
  const skip = new Set()
  return {
    passes,
    conditions,
    steps: passes ? runtimeSteps.flatMap((step, index) => {
      if (skip.has(index)) return []
      if (step.type === 'branch') {
        const results = conditionResults(step.when, context.data, null)
        const taken = results.every((item) => item.passes) ? 'yes' : 'no'
        const { yes, no } = branchLanes(step, index)
        const [from, to] = taken === 'yes' ? no : yes
        for (let lane = from; lane < to; lane += 1) skip.add(lane)
        return [{ index, kind: 'branch', summary: taken === 'yes' ? 'La condición se cumple: sigue por «Sí»' : 'La condición no se cumple: sigue por «No»', path: taken, conditions: results }]
      }
      const preview = previewStep(step, rawSteps[index], index, { ...automation, steps: runtimeSteps }, context)
      // Results of this step become data for the next ones, as at run time.
      if (preview.kind === 'service') {
        const contract = SERVICE_CONTRACTS[step.service]
        for (const name of stepOutputKeys(index, contract)) context.data = { ...context.data, [name]: sampleOutput(name.replace(/^paso\d+_/, '')) }
      }
      return [preview]
    }) : [],
  }
}
