// Blueprint of the products list rendered by RunlyTable (table, list and card
// views, resizable columns, pagination footer). The filter keys are the query
// params of GET /catalog/products.
const TYPE_OPTIONS = [
  { value: 'SIMPLE', label: 'Simple' },
  { value: 'VARIABLE', label: 'Con variantes' },
]

export function buildProductsBlueprint({ categoryOptions = [], outletOptions = [] } = {}) {
  return {
    key: 'catalog.products.list',
    schema: {
      apiPath: '/catalog/products',
      primaryField: 'name',
      subtitleField: 'sku',
      statusField: 'product_type',
      searchable: true,
      searchPlaceholder: 'Buscar por nombre, SKU o código de barras',
      columns: [
        { field: 'image_url', label: 'Imagen', type: 'image', sortable: false },
        { field: 'name', label: 'Producto', sortable: false, link: true },
        { field: 'product_type', label: 'Tipo', sortable: false, type: 'select', options: TYPE_OPTIONS, defaultVisible: false },
        { field: 'sku', label: 'SKU', sortable: false },
        { field: 'barcode', label: 'Código de barras', sortable: false, defaultVisible: false },
        { field: 'category_name', label: 'Categoría', sortable: false },
        { field: 'price', label: 'Precio', type: 'currency', sortable: false },
        { field: 'stock', label: 'Existencias', sortable: false, component: 'ProductStockCell' },
        { field: 'pos_enabled', label: 'Canales', sortable: false, component: 'ProductChannelsCell' },
      ],
      filters: [
        { key: 'categoryId', label: 'Categoría', type: 'select', options: categoryOptions },
        { key: 'type', label: 'Tipo', type: 'select', options: TYPE_OPTIONS },
        { key: 'published', label: 'Web', type: 'select', options: [{ value: 'true', label: 'Publicado en web' }, { value: 'false', label: 'Borrador web' }] },
        { key: 'stockStatus', label: 'Existencias', type: 'select', options: [{ value: 'ok', label: 'Disponible o sin control' }, { value: 'low', label: 'Bajas' }, { value: 'out', label: 'Agotadas' }] },
        // POS availability is outlet-specific in the contract: both params go together.
        { key: 'outletId', label: 'Sucursal de POS', type: 'select', options: outletOptions },
        { key: 'posAvailable', label: 'POS en la sucursal', type: 'select', options: [{ value: 'true', label: 'Habilitado' }, { value: 'false', label: 'No habilitado' }] },
      ],
      emptyState: { message: 'Todavía no hay productos.' },
    },
  }
}
