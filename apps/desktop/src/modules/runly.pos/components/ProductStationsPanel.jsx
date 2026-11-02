import { POS_ADMIN_TOUCH } from './adminTouch.js'
import { useMemo } from 'react'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
  EmptyState, SelectField, SwitchField,
} from '@runly/ui'
import { usePosCatalogProducts } from '../hooks/usePosCatalog'
import { useProductConfigs, useUpdateProductConfig } from '../hooks/usePosProductConfigs'

const NONE = '__none__'

function ProductConfigRow({ product, config, stationOptions }) {
  const updateConfig = useUpdateProductConfig()
  const stationId = config?.stationId ?? NONE
  const requiresPreparation = config?.requiresPreparation ?? true

  function handleStationChange(value) {
    updateConfig.mutate({
      productId: product.id,
      data: { stationId: value === NONE ? null : value },
    })
  }

  function handleRequiresPreparationChange(checked) {
    updateConfig.mutate({
      productId: product.id,
      data: { requiresPreparation: checked },
    })
  }

  return (
    <li className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-medium">{product.name}</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="sm:w-64">
          <SelectField contentClassName={POS_ADMIN_TOUCH}
            value={stationId}
            onChange={handleStationChange}
            options={stationOptions}
            disabled={updateConfig.isPending}
          />
        </div>
        <SwitchField touchTarget
          id={`product-${product.id}-requires-preparation`}
          label="Requiere preparación"
          checked={requiresPreparation}
          onChange={handleRequiresPreparationChange}
          disabled={updateConfig.isPending}
        />
      </div>
    </li>
  )
}

export default function ProductStationsPanel({ stations = [] }) {
  const { data: products = [], isLoading: loadingProducts } = usePosCatalogProducts()
  const { data: configs = [], isLoading: loadingConfigs } = useProductConfigs()

  const configByProductId = useMemo(() => {
    const map = new Map()
    for (const c of configs) map.set(c.productId, c)
    return map
  }, [configs])

  const stationOptions = useMemo(() => [
    { value: NONE, label: 'Sin estación (usa la de la sucursal)' },
    ...stations.map((s) => ({ value: s.id, label: s.name })),
  ], [stations])

  const isLoading = loadingProducts || loadingConfigs

  return (
    <Card>
      <CardHeader>
        <CardTitle>Asignación de productos</CardTitle>
        <CardDescription>Los productos sin estación usan la estación por defecto de la sucursal.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando productos...</p>
        ) : products.length === 0 ? (
          <EmptyState title="Sin productos" description="Crea productos en el catálogo para asignarlos a una estación." />
        ) : (
          <ul className="divide-y divide-border">
            {products.map((p) => (
              <ProductConfigRow
                key={p.id}
                product={p}
                config={configByProductId.get(p.id)}
                stationOptions={stationOptions}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
