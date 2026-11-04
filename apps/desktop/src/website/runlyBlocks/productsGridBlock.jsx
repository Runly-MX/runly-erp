import { defineBlock } from '@raulbellosom/atlas-web-builder'

import ProductsGridRenderer from './ProductsGridRenderer.jsx'

// Browses the real published catalog. Add-to-cart uses the browser cart (storeCart.js) that the cart page checks out.
export const ProductsGridBlock = defineBlock({
  type:     'ProductsGridBlock',
  label:    'Grid de productos',
  category: 'atlas-ecommerce',
  defaultProps: { categorySlug: '', limit: 8, columns: '4', showPrice: true, showSearch: false, showCategories: false, showAddToCart: false, detailHref: '/producto' },
  fields: {
    categorySlug:   { type: 'text',   label: 'Slug de categoria (opcional)' },
    limit:          { type: 'number', label: 'Maximo de productos' },
    columns:        { type: 'select', label: 'Columnas', options: [{ value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }] },
    showPrice:      { type: 'toggle', label: 'Mostrar precio' },
    showSearch:     { type: 'toggle', label: 'Mostrar buscador' },
    showCategories: { type: 'toggle', label: 'Mostrar filtro de categorias' },
    showAddToCart:  { type: 'toggle', label: 'Boton agregar al carrito' },
    detailHref:     { type: 'link',   label: 'Pagina de detalle del producto' },
  },
  groups: [
    { label: 'Catalogo', fields: ['categorySlug', 'limit', 'columns'] },
    { label: 'Tienda', fields: ['showPrice', 'showSearch', 'showCategories', 'showAddToCart', 'detailHref'] },
  ],
  render: ProductsGridRenderer,
})
