import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { useWebsiteScope } from './useWebsite.js'
import { createCatalogApi } from '../lib/catalogApi.js'

export function useCatalogApi() {
  const { session } = useAuth()
  const token = session?.access_token ?? null
  return useMemo(() => (token ? createCatalogApi(token) : null), [token])
}

// Catalog permissions come from the session; Catalog re-checks every command.
export function useCatalogPermissions() {
  const { userProfile } = useAuth()
  const has = (key) => Boolean(userProfile?.isAdmin || userProfile?.permissions?.includes(key))
  const need = (key) => (has(key) ? { allowed: true } : { allowed: false, reason: { code: 'permission_denied', requiredPermission: key } })
  return { read: need('catalog.products.read'), update: need('catalog.products.update') }
}

export const catalogKeys = {
  all: (companyId) => ['website', companyId, 'catalog'],
  products: (companyId, filters) => ['website', companyId, 'catalog', 'products', filters],
  categories: (companyId) => ['website', companyId, 'catalog', 'categories'],
  usage: (companyId, siteId) => ['website', companyId, 'site', siteId, 'catalog-usage'],
}

export function useCatalogProducts(filters, enabled = true) {
  const { companyId } = useWebsiteScope()
  const api = useCatalogApi()
  return useQuery({
    queryKey: catalogKeys.products(companyId, filters),
    queryFn: ({ signal }) => api.listProducts(filters, { signal }),
    enabled: enabled && Boolean(api && companyId),
    staleTime: 10_000,
    placeholderData: (previous) => previous,
  })
}

export function useCatalogCategories(enabled = true) {
  const { companyId } = useWebsiteScope()
  const api = useCatalogApi()
  return useQuery({
    queryKey: catalogKeys.categories(companyId),
    queryFn: async ({ signal }) => (await api.listCategories({ signal })).data ?? [],
    enabled: enabled && Boolean(api && companyId),
    staleTime: 60_000,
  })
}

// Page drafts of the site, read-only, to show where each product is used.
export function usePageDrafts(siteId, pages, enabled = true) {
  const { api, companyId, ready } = useWebsiteScope()
  const results = useQueries({
    queries: (pages ?? []).slice(0, 50).map((page) => ({
      queryKey: [...catalogKeys.usage(companyId, siteId), page.id, page.revision ?? null],
      queryFn: async ({ signal }) => ({ page, draft: (await api.getDraft(siteId, page.id, { signal })).data }),
      enabled: enabled && ready,
      staleTime: 30_000,
    })),
  })
  return {
    drafts: results.filter((r) => r.data).map((r) => ({ page: r.data.page, document: r.data.draft.document, revision: r.data.draft.revision })),
    isPending: results.some((r) => r.isPending),
    isError: results.some((r) => r.isError),
    truncated: (pages ?? []).length > 50,
  }
}
