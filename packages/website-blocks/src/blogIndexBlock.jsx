import { defineBlock } from '@raulbellosom/atlas-web-builder'

export const BlogIndexBlock = defineBlock({
  type:     'BlogIndexBlock',
  label:    'Lista de posts del blog',
  category: 'atlas',
  defaultProps: { limit: 6, columns: '3', showExcerpt: true, siteId: '' },
  fields: {
    limit:       { type: 'number', label: 'Maximo de posts' },
    columns:     { type: 'select', label: 'Columnas', options: [{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }] },
    showExcerpt: { type: 'toggle', label: 'Mostrar extracto' },
    siteId:      { type: 'text',   label: 'ID del sitio' },
  },
  render({ limit, columns, showExcerpt }) {
    return (
      <div style={{ padding: '24px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', textAlign: 'center' }}>
        <p style={{ color: '#94a3b8', fontSize: '14px' }}>
          Lista de posts del blog · maximo {limit} · {columns} columnas
          {showExcerpt ? ' · con extracto' : ''}
        </p>
        <p style={{ color: '#cbd5e1', fontSize: '12px', marginTop: '4px' }}>Los posts apareceran aqui en el sitio publicado</p>
      </div>
    )
  },
})
