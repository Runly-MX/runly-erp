import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { AUTOMATION_FILE, DEFAULT_CLEANUP, cleanAutomation, exportAutomationFile, parseAutomationFile, riskSummary, validateAutomationDefinition } from '../automation-file.js'
import { validateSystemAutomation } from '../automations.js'

const fixture = (name) => readFileSync(new URL(`./fixtures/automation-file/${name}.runly-automation.json`, import.meta.url), 'utf8')
const parseFixture = (name, options) => parseAutomationFile(fixture(name), options)
const codes = (result) => result.errors.map((e) => e.code)
const bytesOf = (length) => new Uint8Array(length).fill(0x20)

test('a valid file parses to a paused definition without key or stored-row fields', () => {
  const text = JSON.stringify({ ...JSON.parse(fixture('valid')), automation: { ...JSON.parse(fixture('valid')).automation, id: 'row', key: 'viejo', webhookToken: 'secreto', lastRun: { status: 'success' }, enabled: true } })
  const result = parseAutomationFile(text)
  assert.equal(result.ok, true)
  assert.equal(result.definition.enabled, false, 'import is always paused, whatever the file says')
  for (const field of ['id', 'key', 'webhookToken', 'lastRun', 'updatedAt']) assert.equal(field in result.definition, false, field)
  assert.deepEqual(validateAutomationDefinition({ ...result.definition, key: 'importada' }), [])
  assert.deepEqual(result.warnings, [])
  assert.equal(validateAutomationDefinition, validateSystemAutomation, 'validation is the shared validator, re-exported')
})

test('people and company references are cleaned and counted; the risk summary describes the ORIGINAL file', () => {
  const result = parseFixture('people-and-references')
  assert.deepEqual(result.removed, { people: 2, externalEmails: 1, chatChannels: 2, fileIds: 1, contactIds: 1, templateIds: 1, recordIds: 0 })
  const text = JSON.stringify(result.definition)
  for (const leaked of ['11111111-1111', 'ventas', 'externo@otra-empresa', '22222222-2222', '33333333-3333', '44444444-4444']) assert.equal(text.includes(leaked), false, leaked)
  assert.equal(result.definition.steps[1].approvers.length, 0)
  // Values that come from the flow are kept: only literals of another company go.
  assert.equal(result.definition.steps[0].args.title.template, 'Lead {{name}}')
  assert.ok(result.warnings.length > 0 && result.warnings.every((w) => w.code === 'definition_check'), 'steps left incomplete are reported, not rejected')
  assert.deepEqual(result.riskSummary, { services: ['runly.chat:messages.post', 'runly.contacts:contacts.read', 'runly.documents:documents.generate', 'runly.notifications:email.send', 'runly.notifications:notifications.send'], httpHosts: [], externalEmailCount: 1, hasChatChannels: true, hasAttachments: true, hasApprovals: true, importsPaused: true })
})

test('cleanup axes are independent and the conservative defaults drop external emails (D-E4 recommendation, not an approval)', () => {
  assert.equal(DEFAULT_CLEANUP.externalEmails, true)
  const kept = parseFixture('external-emails', { cleanup: { ...DEFAULT_CLEANUP, externalEmails: false } })
  assert.equal(kept.removed.externalEmails, 0)
  assert.ok(JSON.stringify(kept.definition).includes('dos@externo.example'))
  const dropped = parseFixture('external-emails')
  assert.equal(dropped.removed.externalEmails, 3)
  assert.equal(JSON.stringify(dropped.definition).includes('externo.example'), false)
  // Risk is about the file: two distinct addresses (case-insensitive), whatever the cleanup does.
  assert.equal(dropped.riskSummary.externalEmailCount, 2)
  assert.equal(kept.riskSummary.externalEmailCount, 2)
  const people = parseFixture('people-and-references', { cleanup: { people: true } })
  assert.deepEqual(people.removed, { people: 2, externalEmails: 0, chatChannels: 0, fileIds: 0, contactIds: 0, templateIds: 0, recordIds: 0 })
})

test('cleaning reaches the actions inside a loop and never mutates its input', () => {
  const definition = { label: 'Bucle', trigger: { type: 'webhook', fields: [] }, steps: [{ type: 'loop', service: 'runly.contacts:contacts.search', do: [{ service: 'runly.notifications:notifications.send', args: { userIds: { from: 'value', value: ['u1'] }, title: { from: 'template', template: 'x' } } }] }] }
  const before = JSON.stringify(definition)
  const { definition: clean, removed } = cleanAutomation(definition, DEFAULT_CLEANUP)
  assert.equal(removed.people, 1)
  assert.equal(clean.steps[0].do[0].args.userIds, undefined)
  assert.equal(JSON.stringify(definition), before)
})

test('size is measured in UTF-8 bytes: 200 KiB passes, 200 KiB + 1 byte is rejected, for text and bytes', () => {
  const body = (extra) => JSON.stringify({ format: 'runly.automation', version: 1, automation: { label: 'x', trigger: { type: 'webhook', fields: [] }, steps: [], note: extra } })
  const fill = AUTOMATION_FILE.maxBytes - Buffer.byteLength(body(''))
  const exact = body('a'.repeat(fill))
  assert.equal(Buffer.byteLength(exact), AUTOMATION_FILE.maxBytes)
  assert.notEqual(codes(parseAutomationFile(exact)).at(0), 'file_too_large')
  const over = body('a'.repeat(fill + 1))
  assert.deepEqual(codes(parseAutomationFile(over)), ['file_too_large'])
  assert.deepEqual(codes(parseAutomationFile(new TextEncoder().encode(over))), ['file_too_large'])
  // 70,000 two-byte characters are 70,000 UTF-16 units (under the old check) but 140,000+ bytes: and 110,000 of them exceed 200 KiB.
  assert.deepEqual(codes(parseAutomationFile(body('ñ'.repeat(110_000)))), ['file_too_large'])
  assert.deepEqual(codes(parseAutomationFile(bytesOf(AUTOMATION_FILE.maxBytes + 1))), ['file_too_large'])
})

test('future and foreign files are rejected with stable codes and no definition', () => {
  const file = (patch) => JSON.stringify({ format: 'runly.automation', version: 1, automation: { label: 'x', trigger: { type: 'webhook', fields: [] }, steps: [] }, ...patch })
  const cases = [
    [file({ version: 2 }), 'file_version_newer'], [file({ version: 99 }), 'file_version_newer'], [file({ version: 0 }), 'file_version_invalid'], [file({ version: '1' }), 'file_version_invalid'],
    [file({ format: 'otra' }), 'not_automation_file'], ['[]', 'not_automation_file'], ['null', 'not_automation_file'], ['no json', 'invalid_json'],
    [file({ automation: { label: 'x' } }), 'automation_incomplete'], [file({ automation: null }), 'automation_incomplete'],
  ]
  for (const [text, code] of cases) {
    const result = parseAutomationFile(text)
    assert.deepEqual([result.ok, codes(result), result.definition, result.riskSummary], [false, [code], null, null], code)
  }
  assert.deepEqual(codes(parseAutomationFile(new Uint8Array([0xff, 0xfe, 0x7b]))), ['invalid_json'])
  assert.throws(() => parseAutomationFile(42), TypeError)
})

test('export is deterministic, paused and carries no row data', () => {
  const item = { id: 'i1', key: 'avisar', label: 'Avisar', enabled: true, webhookToken: 'secreto', updatedAt: 'x', lastRun: {}, trigger: { type: 'webhook', fields: [] }, steps: [] }
  const file = exportAutomationFile(item, { exportedAt: '2026-11-01T12:00:00.000Z' })
  assert.deepEqual(file, exportAutomationFile(item, { exportedAt: '2026-11-01T12:00:00.000Z' }))
  assert.equal(file.automation.enabled, false)
  assert.equal(JSON.stringify(file).includes('secreto'), false)
  assert.equal(file.exportedAt, '2026-11-01T12:00:00.000Z')
  assert.throws(() => exportAutomationFile(item), TypeError)
  assert.equal(item.enabled, true, 'the input is not modified')
  // Round trip: what we export, we can import.
  const again = parseAutomationFile(JSON.stringify(file))
  assert.equal(again.ok, true)
  assert.equal(again.definition.label, 'Avisar')
})

test('riskSummary invents nothing: an empty flow asks for nothing', () => {
  assert.deepEqual(riskSummary({ label: 'x', trigger: { type: 'webhook', fields: [] }, steps: [] }), { services: [], httpHosts: [], externalEmailCount: 0, hasChatChannels: false, hasAttachments: false, hasApprovals: false, importsPaused: true })
  assert.deepEqual(riskSummary(JSON.parse(fixture('valid')).automation).httpHosts, ['hooks.example.com'])
})
