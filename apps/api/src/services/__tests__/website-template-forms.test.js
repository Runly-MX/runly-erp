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

test('newsletter creation provisions ownership and one required email field on the supplied transaction',async()=>{
  let created,scope,fields,locked=false
  const tx={
    $queryRaw:async()=>{locked=true;return []},
    websiteForm:{findFirst:async({where})=>where.name?null:created,create:async({data})=>(created={id:'fixture-form',...data})},
    websiteFormScope:{findFirst:async()=>null,create:async({data})=>(scope=data)},
    websiteSite:{findFirst:async()=>({id:'fixture-site',name:'Fixture site',enabled:true})},
    growthProperty:{findFirst:async()=>null,upsert:async()=>({id:'fixture-analytics',websiteSiteId:'fixture-site',enabled:true})},
    websiteFormField:{createMany:async({data})=>{fields=data}},
  }
  const id=await ensureTemplateForm({tx,companyId:'fixture-company',siteId:'fixture-site',placeholder:'@newsletter'})
  assert.equal(id,created.id);assert.equal(locked,true)
  assert.equal(scope.ownerWebsiteSiteId,'fixture-site');assert.equal(scope.analyticsPropertyId,'fixture-analytics')
  assert.equal(fields.length,1);assert.equal(fields[0].fieldType,'email');assert.equal(fields[0].required,true)
  assert.equal(created.honeypotEnabled,true)
  const doc=mixed();bindContactForm(doc,{'@newsletter':id,'@contact':null})
  assert.equal(doc.blocks.news.props.formId,id)
  tx.websiteFormField.createMany=async()=>{throw Error('fixture-field-write-failed')}
  await assert.rejects(ensureTemplateForm({tx,companyId:'fixture-company',siteId:'fixture-site',placeholder:'@newsletter'}),/fixture-field-write-failed/)
})
