// apps/desktop/src/modules/runly.catalog/components/product/PosAvailabilityPanel.jsx
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ErrorState, SectionCard, SegmentedControl, Skeleton, StatusPill } from '@runly/ui'
import { CircleCheck, CircleSlash, Info, Store, TriangleAlert } from 'lucide-react'
import { runly } from '../../../../lib/runly.js'
import { classifyCommerceError } from '../../lib/commerceCommand.js'
import { useCommerceCommand } from '../../lib/useCommerceCommand.js'
import CommandFailureAlert from '../CommandFailureAlert.jsx'
import ToggleRow from '../ToggleRow.jsx'

const OUTLET_OPTIONS = [
  { value: 'inherit', label: 'General' },
  { value: 'on', label: 'Sí' },
  { value: 'off', label: 'No' },
]

// C1 admin availability: one general baseline plus per-outlet exceptions
// (enabled:null returns an outlet to the baseline). Independent from web
// publication, the product's active state and its stock.
export default function PosAvailabilityPanel({ productId, token, canUpdate, published }) {
  const queryClient = useQueryClient()
  const queryKey = ['catalog-pos-availability', productId, token]
  const query = useQuery({
    queryKey,
    queryFn: () => runly.catalogCommerce.availability(productId, {}, token),
    enabled: Boolean(token),
    staleTime: 15_000,
  })
  const command = useCommerceCommand({
    prefix: 'cat-pos',
    run: (body, options) => runly.catalogCommerce.setAvailability(productId, body, token, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog-pos-availability', productId] })
      queryClient.invalidateQueries({ queryKey: ['catalog-product', productId] })
      queryClient.invalidateQueries({ queryKey: ['catalog-products'] })
    },
  })

  const data = query.data?.data
  const busyOutlet = command.isPending ? command.variables?.outletId ?? 'baseline' : null

  return (
    <SectionCard
      title="Disponible en punto de venta"
      icon={Store}
      description="Decide dónde se puede vender. Publicar en la web no cambia esto, ni esto publica en la web."
    >
      {query.isPending ? (
        <div className="space-y-2" aria-label="Cargando disponibilidad"><Skeleton className="h-11" /><Skeleton className="h-11" /></div>
      ) : query.isError ? (
        <ErrorState title="No se pudo leer la disponibilidad" description={classifyCommerceError(query.error).message} onRetry={query.refetch} />
      ) : (
        <div className="space-y-4">
          <CommandFailureAlert failure={command.failure} onRetry={command.retry} retrying={command.isPending} />
          <div className="rounded-xl border border-[hsl(var(--border))] p-3">
            <ToggleRow
              id={`pos-baseline-${productId}`}
              label="En todas las sucursales"
              description={data.baseline ? 'Se vende salvo en las sucursales marcadas con «No».' : 'No se vende salvo en las sucursales marcadas con «Sí».'}
              checked={data.baseline}
              onChange={(enabled) => command.mutate({ enabled })}
              disabled={!canUpdate || command.isPending}
            />
            {busyOutlet === 'baseline' && <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]" aria-live="polite">Guardando...</p>}
          </div>

          {data.outlets.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">No hay sucursales activas. Créalas en la configuración del punto de venta.</p>
          ) : (
            <ul className="divide-y divide-[hsl(var(--border))] rounded-xl border border-[hsl(var(--border))]" aria-label="Disponibilidad por sucursal">
              {data.outlets.map((outlet) => (
                <li key={outlet.outletId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">{outlet.name}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      {outlet.enabled
                        ? <StatusPill size="sm" tone="success" icon={CircleCheck}>Se vende</StatusPill>
                        : <StatusPill size="sm" tone="neutral" icon={CircleSlash}>No se vende</StatusPill>}
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">{outlet.inherited ? 'según la configuración general' : 'excepción de esta sucursal'}</span>
                    </div>
                  </div>
                  <SegmentedControl
                    ariaLabel={`Disponibilidad en ${outlet.name}`}
                    options={OUTLET_OPTIONS}
                    value={outlet.inherited ? 'inherit' : outlet.enabled ? 'on' : 'off'}
                    onChange={(v) => command.mutate({ outletId: outlet.outletId, enabled: v === 'inherit' ? null : v === 'on' })}
                    disabled={!canUpdate || command.isPending}
                    className="w-auto sm:w-64 [&>button]:min-h-9"
                  />
                  {busyOutlet === outlet.outletId && <span className="w-full text-xs text-[hsl(var(--muted-foreground))]" aria-live="polite">Guardando...</span>}
                </li>
              ))}
            </ul>
          )}

          {data.disabledVariantIds?.length > 0 && (
            <p className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-300">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {data.disabledVariantIds.length === 1 ? 'Una variante sigue bloqueada' : `${data.disabledVariantIds.length} variantes siguen bloqueadas`} para POS por una configuración anterior; las demás heredan esta disponibilidad.
            </p>
          )}
          <p className="flex items-start gap-2 text-xs text-[hsl(var(--muted-foreground))]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Web: {published ? 'publicado' : 'borrador'}. Las existencias y la moneda también deciden si se puede cobrar en cada sucursal.
          </p>
        </div>
      )}
    </SectionCard>
  )
}
