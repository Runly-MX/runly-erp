import test from 'node:test'
import assert from 'node:assert/strict'
import { bindContactForm, usesContactForm, CONTACT_FORM_PLACEHOLDER } from '../website-template-forms.js'

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
