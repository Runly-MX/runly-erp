import { websiteFetch } from './websiteApi.js'

const s = encodeURIComponent

// Catalog's own REST contract. Website never writes product data; the only
// write is Catalog's publish/unpublish command (web visibility, independent of
// POS availability).
export function createCatalogApi(token) {
  const call = (path, options) => websiteFetch(path, token, options)
  return {
    listProducts: ({ published, search, categoryId, page = 1, pageSize = 24 } = {}, o) => {
      const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (published !== undefined) query.set('published', String(published))
      if (search) query.set('search', search)
      if (categoryId) query.set('categoryId', categoryId)
      return call(`/catalog/products?${query}`, o)
    },
    listCategories: (o) => call('/catalog/categories?flat=true', o),
    setPublished: (productId, published) => call(`/catalog/products/${s(productId)}/${published ? 'publish' : 'unpublish'}`, { method: 'POST' }),
  }
}
