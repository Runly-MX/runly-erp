// Manifest `consumes` and `events` (spec 2026-10-03-rme3-module-platform-v2 §15.3):
//
//   consumes: { 'runly.inventory': ['items.read', 'items.search'] }
//   events: { subscribes: ['inventory.item.updated'] }
//
// Shape only: which services exist and which events are published is owned
// by the API (module-services/service-catalog.js, domain-events/events.js).

const MODULE_KEY_RE = /^[a-z][a-z0-9]*\.[a-z][a-z0-9_]*$/
const SERVICE_RE = /^[a-z][a-zA-Z]*\.[a-z][a-zA-Z]*$/
const EVENT_RE = /^[a-z]+\.[a-z_]+\.[a-z_]+$/
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const SCHEDULE_EVERY = ['hour', 'day', 'week', 'month']
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

// manifest.schedules (Builder schedule automations): [{ key, every, at?, weekday?, day? }]
function validateSchedules(manifest, errors) {
  if (manifest?.schedules === undefined) return
  if (!Array.isArray(manifest.schedules)) { errors.push('schedules must be an array'); return }
  for (const item of manifest.schedules) {
    if (!isPlainObject(item) || !/^[a-z][a-z0-9_]{1,40}$/.test(String(item.key ?? ''))) { errors.push('schedules: every item needs a snake_case key'); continue }
    if (!SCHEDULE_EVERY.includes(item.every)) errors.push(`schedules.${item.key}: every must be one of ${SCHEDULE_EVERY.join(', ')}`)
    if (item.every !== 'hour' && !TIME_RE.test(String(item.at ?? ''))) errors.push(`schedules.${item.key}: at must look like "08:00"`)
    if (item.every === 'week' && !(Number.isInteger(item.weekday) && item.weekday >= 0 && item.weekday <= 6)) errors.push(`schedules.${item.key}: weekday must be 0-6`)
    if (item.every === 'month' && !(Number.isInteger(item.day) && item.day >= 1 && item.day <= 28)) errors.push(`schedules.${item.key}: day must be 1-28`)
  }
}

export function validateIntegrations(manifest, errors) {
  validateSchedules(manifest, errors)
  if (manifest?.consumes !== undefined) {
    if (!isPlainObject(manifest.consumes)) errors.push('consumes must be an object { moduleKey: [service, ...] }')
    else {
      for (const [moduleKey, services] of Object.entries(manifest.consumes)) {
        if (!MODULE_KEY_RE.test(moduleKey)) errors.push(`consumes: "${moduleKey}" is not a module key`)
        if (!Array.isArray(services) || !services.length) errors.push(`consumes.${moduleKey} must be a non-empty array`)
        else for (const service of services) if (!SERVICE_RE.test(String(service))) errors.push(`consumes.${moduleKey}: "${service}" must look like "items.read"`)
      }
    }
  }
  if (manifest?.events !== undefined) {
    if (!isPlainObject(manifest.events)) errors.push('events must be an object { subscribes: [...] }')
    else if (manifest.events.subscribes !== undefined) {
      if (!Array.isArray(manifest.events.subscribes)) errors.push('events.subscribes must be an array')
      else for (const event of manifest.events.subscribes) if (!EVENT_RE.test(String(event))) errors.push(`events.subscribes: "${event}" must look like "inventory.item.updated"`)
    }
  }
}
