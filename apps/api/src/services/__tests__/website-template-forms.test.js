import test from 'node:test'
import assert from 'node:assert/strict'
import { bindContactForm, usesContactForm, placeholdersIn, ensureTemplateForm, CONTACT_FORM_PLACEHOLDER } from '../website-template-forms.js'

const document = () => ({
  regions: { main: { id: 'r', children: ['section', 'footer'] } },
  blocks: {
    section: { id: 'section', type: 'SectionBlock', props: {}, children: { children: ['form', 'text'] } },
    form: { id: 'form', type: 'ContactFormBlock', props: { formId: CONTACT_FORM_PLACEHOLDER }, children: {} },
    text: { id: 'text', type: 'TextBlock', props: {}, children: {} },
    footer: { id: 'footer', type: 'FooterBlock', props: {}, children: {} },
  },
})

test('detects the placeholder and binds the created form id', () => {
  assert.equal(usesContactForm(document()), true)
  const bound = bindContactForm(document(), 'form-uuid')
  assert.equal(bound.blocks.form.props.formId, 'form-uuid')
  assert.equal(usesContactForm(bound), false)
})

test('without a form the placeholder blocks are removed from every parent', () => {
  const bound = bindContactForm(document(), null)
  assert.equal(bound.blocks.form, undefined)
  assert.deepEqual(bound.blocks.section.children.children, ['text'])
})

const mixed = () => {
  const doc = document()
  doc.blocks.news = { id: 'news', type: 'ContactFormBlock', props: { formId: '@newsletter' }, children: {} }
  doc.blocks.section.children.children.push('news')
  return doc
}

test('binds each placeholder to its own form and drops only the one without a form', () => {
  assert.deepEqual(placeholdersIn(mixed()).sort(), ['@contact', '@newsletter'])
  const bound = bindContactForm(mixed(), { '@contact': 'c-id', '@newsletter': null })
  assert.equal(bound.blocks.form.props.formId, 'c-id')
  assert.equal(bound.blocks.news, undefined)
  assert.deepEqual(bound.blocks.section.children.children, ['form', 'text'])
})

test('a real form id is not mistaken for a placeholder', () => {
  const doc = document()
  doc.blocks.form.props.formId = 'real-uuid'
  assert.equal(usesContactForm(doc), false)
})

test('ensureTemplateForm reuses an existing form by name', async () => {
  const tx = { websiteForm: { findFirst: async ({ where }) => ({ id: `reuse-${where.name}` }) } }
  assert.equal(await ensureTemplateForm({ tx, companyId: 'c', siteId: 's', placeholder: '@newsletter' }), 'reuse-Newsletter')
})
