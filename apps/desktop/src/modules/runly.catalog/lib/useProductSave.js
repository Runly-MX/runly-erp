// apps/desktop/src/modules/runly.catalog/lib/useProductSave.js
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { runly } from '../../../lib/runly.js'
import { classifyCommerceError } from './commerceCommand.js'
import { detectFieldConflicts } from './catalogRules.js'

export const FIELD_LABELS = {
  name: 'Nombre', slug: 'Dirección web', description: 'Descripción', category_id: 'Categoría', attributes: 'Atributos',
  price: 'Precio', compare_price: 'Precio anterior', currency: 'Moneda', sku: 'SKU', barcode: 'Código de barras',
  weight: 'Peso', track_stock: 'Controlar existencias', meta_title: 'Título para buscadores',
  meta_description: 'Descripción para buscadores', product_type: 'Tipo', cover_asset_id: 'Imagen', images: 'Imágenes',
}

// Field conflict UX plus an atomic server revision check closes the read/write gap.
export function useProductSave({ productId, token }) {
  const queryClient = useQueryClient()
  const [conflict, setConflict] = useState(null)
  const mutation = useMutation({
    mutationFn: async ({ data, base, force = false }) => {
      const fresh = (await runly.catalog.getProduct(productId, token)).data
      if (!force && base) {
        const fields = detectFieldConflicts(base, fresh, data, Object.keys(data))
        if (fields.length) throw Object.assign(new Error('conflict'), { conflictFields: fields, pending: { data, base } })
      }
      return (await runly.catalog.updateProduct(productId, data, token, {expectedVersion:fresh.revision})).data
    },
    onSuccess: (row, variables) => {
      setConflict(null)
      queryClient.setQueryData(['catalog-product', productId, token], (old) => (old ? { ...old, data: { ...old.data, ...row } } : old))
      queryClient.invalidateQueries({ queryKey: ['catalog-product', productId] })
      queryClient.invalidateQueries({ queryKey: ['catalog-products'] })
      variables.onSaved?.(row)
      toast.success(variables.successMessage ?? 'Cambios guardados')
    },
    onError: (error, variables) => {
      if (error.code === 'CATALOG_VERSION_CONFLICT') {
        setConflict({fields:Object.keys(variables.data),pending:variables}); return
      }
      if (error.conflictFields) {
        setConflict({ fields: error.conflictFields, pending: { ...error.pending, onSaved: variables.onSaved, successMessage: variables.successMessage } })
        return
      }
      toast.error(classifyCommerceError(error).message)
    },
  })
  return {
    save: (data, base, options = {}) => mutation.mutate({ data, base, ...options }),
    saving: mutation.isPending,
    conflict,
    overwrite: () => conflict && mutation.mutate({ ...conflict.pending, force: true }),
    dismissConflict: () => setConflict(null),
  }
}
