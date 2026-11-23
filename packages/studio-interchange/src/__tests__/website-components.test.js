import test from 'node:test'
import assert from 'node:assert/strict'
import { COMPONENT_LIMITS, COMPONENT_REF_TYPE, overridableFromCatalog, resolveComponents, validateComponentDefinitions } from '../website-components.js'

const catalog = { blocks: [
  { type: 'TextBlock', fields: { text: { type: 'text' }, align: { type: 'select' } } },
  { type: 'ImageBlock', fields: { src: { type: 'image' }, link: { type: 'link' } } },
  { type: 'SectionBlock', fields: {} },
] }
const overridable = overridableFromCatalog(catalog)
const footer = { name: 'Pie de página', section: { type: 'SectionBlock', props: {}, children: { children: [
  { type: 'TextBlock', props: { text: 'Hecho en Runly', align: 'center' } },
  { type: 'ImageBlock', props: { src: 'asset:' + 'a'.repeat(64), link: '/' } },
] } } }
const ref = (props) => ({ type: COMPONENT_REF_TYPE, props })

test('components: a reference expands in place, keeping order and untouched siblings', () => {
  const sections = [{ type: 'TextBlock', props: { text: 'Antes' } }, ref({ componentId: 'footer' }), { type: 'TextBlock', props: { text: 'Después' } }]
  const { sections: out, errors } = resolveComponents(sections, { footer }, { overridable })
  assert.deepEqual(errors, [])
  assert.deepEqual(out.map((s) => s.type), ['TextBlock', 'SectionBlock', 'TextBlock'])
  assert.deepEqual(out[1], footer.section)
  assert.notEqual(out[1], footer.section, 'expanded copies never alias the definition')
  assert.equal(JSON.stringify(sections).includes('Antes'), true, 'input is not mutated')
})

test('components: two pages share one definition and editing it updates both', () => {
  const page = () => [ref({ componentId: 'footer' })]
  const before = [resolveComponents(page(), { footer }).sections, resolveComponents(page(), { footer }).sections]
  const edited = { footer: { ...footer, section: { ...footer.section, children: { children: [{ type: 'TextBlock', props: { text: 'Nuevo pie' } }] } } } }
  const after = [resolveComponents(page(), edited).sections, resolveComponents(page(), edited).sections]
  assert.deepEqual(before[0], before[1])
  assert.ok(after.every((p) => p[0].children.children[0].props.text === 'Nuevo pie'))
})

test('components: references work inside slots of other blocks', () => {
  const { sections, errors } = resolveComponents([{ type: 'SectionBlock', children: { children: [ref({ componentId: 'footer' })] } }], { footer })
  assert.deepEqual(errors, [])
  assert.equal(sections[0].children.children[0].type, 'SectionBlock')
})

test('components: overrides change content props by path and only content props', () => {
  const overrides = { 'root/children/0': { text: 'Otro texto' }, 'root/children/1': { src: 'asset:' + 'b'.repeat(64), link: '/contacto' } }
  const { sections, errors } = resolveComponents([ref({ componentId: 'footer', overrides })], { footer }, { overridable })
  assert.deepEqual(errors, [])
  assert.equal(sections[0].children.children[0].props.text, 'Otro texto')
  assert.equal(sections[0].children.children[0].props.align, 'center', 'other props keep the definition value')
  assert.equal(sections[0].children.children[1].props.link, '/contacto')
  assert.equal(footer.section.children.children[0].props.text, 'Hecho en Runly', 'definition is never modified')
})

test('components: forbidden or malformed overrides are reported and not applied', () => {
  const cases = [
    { 'root/children/0': { align: 'left' } },              // select field: structure/style, not content
    { 'root/children/9': { text: 'x' } },                  // path does not exist
    { 'root/other/0': { text: 'x' } },                     // slot does not exist
    { 'root/children': { text: 'x' } },                    // odd number of segments
    { 'root/children/0': { text: 5 } },                    // non-string value
    { 'root/children/0': { __proto__x: 'x', ['a'.repeat(50)]: 'x' } },
    { '../etc': { text: 'x' } },
    { 'root/children/0': { text: 'x'.repeat(COMPONENT_LIMITS.valueLength + 1) } },
  ]
  for (const overrides of cases) {
    const { sections, errors } = resolveComponents([ref({ componentId: 'footer', overrides })], { footer }, { overridable })
    assert.ok(errors.length >= 1 && errors.every((e) => e.code === 'component_override_invalid'), JSON.stringify(overrides))
    assert.equal(sections[0].children.children[0].props.text, 'Hecho en Runly')
  }
  assert.equal(resolveComponents([ref({ componentId: 'footer', overrides: [] })], { footer }, { overridable }).errors[0].code, 'component_override_invalid')
  assert.equal(resolveComponents([ref({ componentId: 'footer', overrides: { 'root/children/0': { text: 'x' } } })], { footer }).errors[0].code, 'component_override_invalid', 'no predicate = nothing overridable')
})

test('components: unknown, malformed and prototype-ish ids drop the reference with a stable code', () => {
  for (const [componentId, code] of [['missing', 'component_missing'], ['__proto__', 'component_id_invalid'], ['constructor', 'component_missing'], ['Bad Id', 'component_id_invalid'], [5, 'component_id_invalid'], [undefined, 'component_id_invalid']]) {
    const { sections, errors } = resolveComponents([ref({ componentId }), { type: 'TextBlock', props: {} }], { footer }, { overridable })
    assert.equal(errors[0].code, code, String(componentId))
    assert.equal(sections.length, 1, 'only the broken reference is dropped')
  }
})

test('components: definitions are validated (ids, names, nesting, size, count)', () => {
  assert.deepEqual(validateComponentDefinitions(undefined), [])
  assert.deepEqual(validateComponentDefinitions({ footer }), [])
  const code = (components) => validateComponentDefinitions(components).map((e) => e.code)
  assert.deepEqual(code([]), ['component_invalid'])
  assert.deepEqual(code({ 'Bad Id': footer }), ['component_id_invalid'])
  assert.deepEqual(code({ a: { name: '', section: footer.section } }), ['component_invalid'])
  assert.deepEqual(code({ a: { name: 'x', section: footer.section, extra: 1 } }), ['component_invalid'])
  assert.deepEqual(code({ a: { name: 'x', section: { type: 'SectionBlock', children: { c: [ref({ componentId: 'b' })] } } } }), ['component_ref_nested'])
  assert.deepEqual(code({ a: { name: 'x', section: { type: 'SectionBlock', children: { c: Array.from({ length: COMPONENT_LIMITS.blocks }, () => ({ type: 'TextBlock' })) } } } }), ['component_invalid'])
  const deep = (n) => (n ? { type: 'SectionBlock', children: { c: [deep(n - 1)] } } : { type: 'TextBlock' })
  assert.deepEqual(code({ a: { name: 'x', section: deep(COMPONENT_LIMITS.depth + 3) } }), ['component_invalid'])
  const many = Object.fromEntries(Array.from({ length: COMPONENT_LIMITS.components + 1 }, (_, i) => [`c${i}`, footer]))
  assert.ok(code(many).includes('component_limit'))
})

test('components: expansion cannot amplify a page beyond the block limit', () => {
  const big = { name: 'Grande', section: { type: 'SectionBlock', children: { c: Array.from({ length: 100 }, () => ({ type: 'TextBlock', props: { text: 'x' } })) } } }
  const { sections, errors } = resolveComponents(Array.from({ length: 10 }, () => ref({ componentId: 'big' })), { big })
  assert.equal(sections.length, 2, '2 x 101 blocks fit in 300, the third does not')
  assert.deepEqual(errors.map((e) => e.code), ['component_limit'])
  assert.equal(resolveComponents([ref({ componentId: 'big' })], { big }, { maxBlocks: 50 }).sections.length, 0)
})

test('components: invalid definitions never expand and hostile input never throws', () => {
  const nestedDef = { name: 'x', section: { type: 'SectionBlock', children: { c: [ref({ componentId: 'a' })] } } }
  assert.equal(resolveComponents([ref({ componentId: 'a' })], { a: nestedDef }).errors[0].code, 'component_missing', 'no infinite expansion through self-reference')
  for (const bad of [null, undefined, 'x', 5, {}]) assert.doesNotThrow(() => resolveComponents(bad, { footer }))
  assert.doesNotThrow(() => resolveComponents([null, 5, 'x', ref(null), ref([]), { type: 'SectionBlock', children: { c: 'no' } }], null))
  assert.deepEqual(resolveComponents([], undefined), { sections: [], errors: [] })
})

import { componentCatalogErrors, componentUsage, resolvePageComponents } from '../website-components.js'
const pageOf = (blocks, children = Object.keys(blocks)) => ({ schemaVersion: 1, id: 'p', slug: '/', title: 'p', visibility: 'public', regions: { main: { id: 'main', children } }, blocks })

test('components (page form): expands like the renderer, keeps other blocks and never mutates the input', () => {
  const page = pageOf({ a: { id: 'a', type: 'TextBlock', props: { text: 'Antes' } }, r: { id: 'r', type: COMPONENT_REF_TYPE, props: { componentId: 'footer', overrides: { 'root/children/0': { text: 'Otro' } } } } })
  const snapshot = JSON.stringify(page)
  const { page: out, errors } = resolvePageComponents(page, { footer }, { overridable })
  assert.deepEqual(errors, [])
  assert.equal(JSON.stringify(page), snapshot)
  const [first, second] = out.regions.main.children
  assert.equal(first, 'a')
  assert.equal(out.blocks[second].type, 'SectionBlock')
  assert.equal(out.blocks[out.blocks[second].children.children[0]].props.text, 'Otro')
  assert.equal(out.blocks.r, undefined)
  const plain = pageOf({ a: { id: 'a', type: 'TextBlock' } })
  assert.equal(resolvePageComponents(plain, {}).page, plain)
})

test('components (page form): broken references are dropped with stable codes and the block limit holds', () => {
  const page = pageOf({ k: { id: 'k', type: 'TextBlock' }, r: { id: 'r', type: COMPONENT_REF_TYPE, props: { componentId: '__proto__' } }, m: { id: 'm', type: COMPONENT_REF_TYPE, props: { componentId: 'gone' } } })
  const { page: out, errors } = resolvePageComponents(page, { footer })
  assert.deepEqual(errors.map((e) => e.code), ['component_id_invalid', 'component_missing'])
  assert.deepEqual(out.regions.main.children, ['k'])
  const big = { name: 'Grande', section: { type: 'SectionBlock', children: { c: Array.from({ length: 100 }, () => ({ type: 'TextBlock', props: { text: 'x' } })) } } }
  const refs = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`r${i}`, { id: `r${i}`, type: COMPONENT_REF_TYPE, props: { componentId: 'big' } }]))
  const limited = resolvePageComponents(pageOf(refs), { big })
  assert.equal(limited.page.regions.main.children.length, 2)
  assert.deepEqual(limited.errors.map((e) => e.code), ['component_limit'])
})

test('components: usage index and catalog check of definitions', () => {
  const ref = (componentId) => ({ id: 'r', type: COMPONENT_REF_TYPE, props: { componentId } })
  const pages = [{ id: 'p1', page: pageOf({ r: ref('footer') }) }, { id: 'p2', page: pageOf({ r: ref('footer'), s: { ...ref('x'), id: 's' } }) }, { id: 'p3', page: pageOf({}) }]
  assert.deepEqual(componentUsage(pages), { footer: ['p1', 'p2'], x: ['p2'] })
  assert.deepEqual(componentCatalogErrors({ footer }, catalog), [])
  assert.deepEqual(componentCatalogErrors({ a: { name: 'x', section: { type: 'Nope' } } }, catalog).map((e) => e.code), ['block_unknown'])
  assert.deepEqual(componentCatalogErrors({ a: { name: 'x', section: { type: 'TextBlock', props: { zzz: 1 } } } }, catalog).map((e) => e.code), ['prop_unknown'])
})
