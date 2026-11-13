import { moduleSlug, permKey, toKebab } from './helpers.js'
import { entityFilePaths, fileFieldProps, generateLayoutDetailView, generateLayoutFormView, getDetailTypeHint, mapFormFieldType, relationLabelField } from './layout-views.js'
import { isSameModuleRelation } from '../relations.js'
import { isExternalRelation } from '../external-relations.js'
import { listColumns, listSchemaExtras } from '../list-config.js'

export function generateTableView(config, entity) {
  const slug = moduleSlug(config.key)
  const apiPath = `/${slug}/${entity.name}s`
  const viewKey = `${slug}.${entity.name}.table`
  const labelPlural = entity.labelPlural || entity.label + 's'

  const columnSource = (f, format, list) => {
    if (isSameModuleRelation(f) || isExternalRelation(f)) return `      { field: '${f.name}__label', label: '${f.label || f.name}', sortable: false${list.primaryField === f.name ? ', primary: true' : ''} },`
    if (f.type === 'file' && f.accept === 'image') {
      return `      { field: '${f.name}', label: '${f.label || f.name}', type: 'image-asset', signedUrlPath: '${entityFilePaths(config, entity).signedUrlPath}' },`
    }
    // entity.list opts into badges for select fields (RunlyTable colors them).
    const typeHint = f.type === 'select' && entity.list ? 'select' : format === 'number' ? 'number' : getColumnTypeHint(f.type, format)
    const options = typeHint === 'select' ? `, options: ${JSON.stringify((f.optionDetails ?? f.options ?? []).map((o) => (typeof o === 'string' ? { value: o, label: o } : o)))}` : ''
    const base = `      { field: '${f.name}', label: '${f.label || f.name}', sortable: true${list.primaryField === f.name ? ', primary: true' : ''}`
    return typeHint ? base + `, type: '${typeHint}'${options} },` : base + ' },'
  }
  const columns = listColumns(entity, { column: columnSource }).join('\n')
  const extras = Object.entries(listSchemaExtras(entity)).map(([key, value]) => `    ${key}: ${JSON.stringify(value)},\n`).join('')

  return `import { defineView } from '@runly/module-engine'

export default defineView({
  key: '${viewKey}',
  kind: 'TABLE',
  version: '0.1.0',
  schema: {
    entity: '${entity.name}',
    component: 'RunlyTable',
    apiPath: '${apiPath}',
    searchable: true,
    searchPlaceholder: 'Buscar ${entity.label.toLowerCase()}...',
${extras}    columns: [
${columns}
    ],
    actions: [
      { label: 'Crear ${entity.label.toLowerCase()}', permission: '${permKey(slug, entity.name, 'create')}', variant: 'primary' },
    ],
    rowActions: [
      { label: 'Ver detalle', permission: '${permKey(slug, entity.name, 'read')}' },
      { label: 'Editar',      permission: '${permKey(slug, entity.name, 'update')}' },
      { label: 'Desactivar',  permission: '${permKey(slug, entity.name, 'delete')}' },
    ],
    emptyState: {
      message: 'No hay ${labelPlural.toLowerCase()} registradas.',
    },
  },
})
`
}

export function generateFormView(config, entity) {
  const layoutView = generateLayoutFormView(config, entity)
  if (layoutView) return layoutView
  const slug = moduleSlug(config.key)
  const apiPath = `/${slug}/${entity.name}s`
  const viewKey = `${slug}.${entity.name}.form`

  const fields = entity.fields
    .map((f) => {
      const lines = [
        `        field: '${f.name}'`,
        `        label: '${f.label || f.name}'`,
        `        type: '${mapFormFieldType(f.type)}'`,
      ]
      if (f.required) lines.push('        required: true')
      if (f.type === 'select' && Array.isArray(f.options)) {
        const opts = f.options.map((o) => JSON.stringify(o)).join(', ')
        lines.push(`        options: [${opts}]`)
      }
      if (isExternalRelation(f)) {
        lines.push(`        relation: { apiPath: '/relation-targets/${f.targetExternal}/search', labelField: 'title', valueField: 'id', clearable: true }`)
      } else if (f.type === 'relation') {
        lines.push(`        relation: { apiPath: '/${slug}/${f.relatedModel ? f.relatedModel.split('.').pop() + 's' : f.name + 's'}', labelField: '${isSameModuleRelation(f) ? relationLabelField(config, f) : 'name'}', clearable: true }`)
      }
      if (f.type === 'file') {
        for (const [prop, value] of Object.entries(fileFieldProps(config, entity, f))) lines.push(`        ${prop}: ${JSON.stringify(value)}`)
      }
      return '      {\n' + lines.map((l) => '    ' + l + ',').join('\n') + '\n      },'
    })
    .join('\n')

  return `import { defineView } from '@runly/module-engine'

export default defineView({
  key: '${viewKey}',
  kind: 'FORM',
  version: '0.1.0',
  schema: {
    entity: '${entity.name}',
    component: 'RunlyForm',
    apiPath: '${apiPath}',
    sections: [
      {
        label: '${entity.label}',
        fields: [
${fields}
        ],
      },
    ],
    submitLabel: 'Guardar ${entity.label.toLowerCase()}',
    cancelLabel: 'Cancelar',
  },
})
`
}

export function generateDetailView(config, entity) {
  const layoutView = generateLayoutDetailView(config, entity)
  if (layoutView) return layoutView
  const slug = moduleSlug(config.key)
  const apiPath = `/${slug}/${entity.name}s`
  const viewKey = `${slug}.${entity.name}.detail`

  const fields = entity.fields
    .map((f) => {
      const typeHint = getDetailTypeHint(f.type)
      const base = `      { field: '${f.name}', label: '${f.label || f.name}'`
      if (isSameModuleRelation(f)) return `      { field: '${f.name}__label', label: '${f.label || f.name}' },`
      if (isExternalRelation(f)) return `      { field: '${f.name}__label', label: '${f.label || f.name}', type: 'external-link', urlField: '${f.name}__url' },`
      if (f.type === 'file') return base + `, type: 'file-asset', accept: '${f.accept ?? 'any'}', signedUrlPath: '${entityFilePaths(config, entity).signedUrlPath}' },`
      return typeHint ? base + `, type: '${typeHint}' },` : base + ' },'
    })
    .join('\n')

  return `import { defineView } from '@runly/module-engine'

export default defineView({
  key: '${viewKey}',
  kind: 'DETAIL',
  version: '0.1.0',
  schema: {
    entity: '${entity.name}',
    component: 'RunlyDetail',
    apiPath: '${apiPath}',
    sections: [
      {
        label: '${entity.label}',
        columns: 2,
        fields: [
${fields}
        ],
      },
      { id: 'audit', type: 'audit', label: 'Historial de cambios', icon: 'History', audit: { entityType: '${slug}.${entity.name}' } },
    ],
    actions: [
      { label: 'Editar',     permission: '${permKey(slug, entity.name, 'update')}' },
      { label: 'Desactivar', permission: '${permKey(slug, entity.name, 'delete')}' },
    ],
  },
})
`
}

export function generatePageView(config, entity) {
  const slug = moduleSlug(config.key)
  const pageKey = `${slug}.${entity.name}.page`
  const tableKey = `${slug}.${entity.name}.table`
  const path = `/app/m/${config.key}/${slug}-${toKebab(entity.name)}s`
  const labelPlural = entity.labelPlural || entity.label + 's'

  return `import { definePage } from '@runly/module-engine'

export default definePage({
  key: '${pageKey}',
  path: '${path}',
  title: '${labelPlural}',
  layout: 'main',
  view: '${tableKey}',
})
`
}

function getColumnTypeHint(type, format) {
  if (format === 'date' || format === 'datetime' || format === 'currency') return format
  const map = { boolean: 'boolean', date: 'date', datetime: 'datetime', decimal: 'currency', number: 'number', color: 'color' }
  return map[type] || null
}
