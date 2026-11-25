import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { generateManifest } from '../templates/manifest.js'
import { generateModel } from '../templates/model.js'
import { generateTableView, generateFormView, generateDetailView, generatePageView } from '../templates/views.js'
import { generateServiceHelpers } from '../templates/service-helpers.js'
import { generateService } from '../templates/service.js'
import { generateRoutes } from '../templates/routes.js'
import { generateEntityValidators } from '../templates/validators.js'
import { generateApiIndex } from '../templates/api-index.js'
import { generateValidatorsIndex } from '../templates/validators-index.js'

const config = {
  key: 'custom.crm',
  name: 'CRM',
  version: '0.1.0',
  description: 'Test',
  icon: 'ContactRound',
  color: '#0f766e',
  pwa: {
    shortName: 'CRM',
    startPath: '/crm-contacts',
  },
  entities: [
    {
      name: 'contact',
      label: 'Contacto',
      labelPlural: 'Contactos',
      softDelete: true,
      companyScoped: true,
      fields: [
        { name: 'full_name', type: 'text', label: 'Nombre', required: true },
        { name: 'email', type: 'email', label: 'Email' },
        { name: 'status', type: 'select', label: 'Estado', options: ['activo', 'inactivo'] },
      ],
    },
  ],
}

const entity = config.entities[0]

describe('generateManifest', () => {
  test('contains module key', () => {
    const out = generateManifest(config)
    assert.ok(out.includes("key: 'custom.crm'"))
  })
  test('contains permission for read', () => {
    const out = generateManifest(config)
    assert.ok(out.includes("crm.contact.read"))
  })
  test('contains navigation entry', () => {
    const out = generateManifest(config)
    assert.ok(out.includes('Contactos'))
  })
  test('contains model path', () => {
    const out = generateManifest(config)
    assert.ok(out.includes('./models/contact.model.js'))
  })
  test('contains module PWA identity', () => {
    const out = generateManifest(config)
    assert.ok(out.includes("icon: 'ContactRound'"))
    assert.ok(out.includes("color: '#0f766e'"))
    assert.ok(out.includes('shortName: "CRM"'))
    assert.ok(out.includes("startPath: '/crm-contacts'"))
  })
})

describe('generateModel', () => {
  test('contains table name', () => {
    const out = generateModel(config, entity)
    assert.ok(out.includes("tableName: 'crm_contact'"))
  })
  test('contains field definitions', () => {
    const out = generateModel(config, entity)
    assert.ok(out.includes("name: 'full_name'"))
  })
  test('contains softDelete', () => {
    const out = generateModel(config, entity)
    assert.ok(out.includes('softDelete: true'))
  })
})

describe('generateTableView', () => {
  test('contains view key', () => {
    const out = generateTableView(config, entity)
    assert.ok(out.includes("key: 'crm.contact.table'"))
  })
  test('contains apiPath', () => {
    const out = generateTableView(config, entity)
    assert.ok(out.includes("apiPath: '/crm/contacts'"))
  })
  test('contains create permission', () => {
    const out = generateTableView(config, entity)
    assert.ok(out.includes('crm.contact.create'))
  })
})

describe('generateFormView', () => {
  test('contains form view key', () => {
    const out = generateFormView(config, entity)
    assert.ok(out.includes("key: 'crm.contact.form'"))
  })
  test('contains field entries', () => {
    const out = generateFormView(config, entity)
    assert.ok(out.includes("field: 'full_name'"))
  })
})

describe('generateDetailView', () => {
  test('contains detail view key', () => {
    const out = generateDetailView(config, entity)
    assert.ok(out.includes("key: 'crm.contact.detail'"))
  })
})

describe('generatePageView', () => {
  test('contains page key', () => {
    const out = generatePageView(config, entity)
    assert.ok(out.includes("key: 'crm.contact.page'"))
  })
  test('references table view', () => {
    const out = generatePageView(config, entity)
    assert.ok(out.includes("view: 'crm.contact.table'"))
  })
})

describe('generateServiceHelpers', () => {
  test('contains error class', () => {
    const out = generateServiceHelpers(config)
    assert.ok(out.includes('class CrmServiceError'))
  })
  test('contains toScopedCompanyUuid', () => {
    const out = generateServiceHelpers(config)
    assert.ok(out.includes('toScopedCompanyUuid'))
  })
})

describe('generateService', () => {
  test('contains service factory export', () => {
    const out = generateService(config, entity)
    assert.ok(out.includes('createContactService'))
  })
  test('contains list function', () => {
    const out = generateService(config, entity)
    assert.ok(out.includes('listContacts'))
  })
  test('references correct table', () => {
    const out = generateService(config, entity)
    assert.ok(out.includes('crm_contact'))
  })
})

describe('generateRoutes', () => {
  test('contains router factory export', () => {
    const out = generateRoutes(config, entity)
    assert.ok(out.includes('createContactRouter'))
  })
  test('contains GET list route', () => {
    const out = generateRoutes(config, entity)
    assert.ok(out.includes("app.get('/crm/contacts'"))
  })
  test('contains POST create route', () => {
    const out = generateRoutes(config, entity)
    assert.ok(out.includes("app.post('/crm/contacts'"))
  })
  test('contains permission key', () => {
    const out = generateRoutes(config, entity)
    assert.ok(out.includes('crm.contact.read'))
  })
  test('contains enabled patch route (soft-delete)', () => {
    const out = generateRoutes(config, entity)
    assert.ok(out.includes('/crm/contacts/:id/enabled'))
  })
})

describe('generateEntityValidators', () => {
  test('contains create schema', () => {
    const out = generateEntityValidators(entity)
    assert.ok(out.includes('createContactSchema'))
  })
  test('contains update schema', () => {
    const out = generateEntityValidators(entity)
    assert.ok(out.includes('updateContactSchema'))
  })
  test('contains zod import', () => {
    const out = generateEntityValidators(entity)
    assert.ok(out.includes("from 'zod'"))
  })
})

describe('generateApiIndex', () => {
  test('exports default router factory', () => {
    const out = generateApiIndex(config)
    assert.ok(out.includes('export default function createCrmRouter'))
  })
  test('mounts entity router', () => {
    const out = generateApiIndex(config)
    assert.ok(out.includes('createContactRouter'))
  })
})

describe('generateValidatorsIndex', () => {
  test('re-exports entity validators', () => {
    const out = generateValidatorsIndex(config)
    assert.ok(out.includes("export * from './contact.validators.js'"))
  })
})
