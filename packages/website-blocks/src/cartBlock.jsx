import { defineBlock } from '@raulbellosom/atlas-web-builder'

export const CartBlock = defineBlock({
  type:     'CartBlock',
  label:    'Carrito de compras',
  category: 'atlas-ecommerce',
  defaultProps: { siteId: '' },
  fields: {
    siteId: { type: 'text', label: 'ID del sitio' },
  },
  render() {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'var(--runly-color-primary, #6D28D9)', color: '#fff', borderRadius: '6px', fontSize: '14px', cursor: 'pointer' }}>
        <span>🛒</span>
        <span>Carrito</span>
      </div>
    )
  },
})
