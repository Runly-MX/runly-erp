// apps/desktop/src/modules/runly.pos/retail/components/ScanMatchesDialog.jsx
import { useQuery } from '@tanstack/react-query'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, ErrorState, Skeleton, cn } from '@runly/ui'
import { Barcode, CircleSlash, Layers } from 'lucide-react'
import { runly } from '../../../../lib/runly.js'
import { classifyPosError } from '../lib/retailErrors.js'
import { formatMoney } from '../lib/retailRules.js'

// Choosing the concrete item: the variants of a product (C1 variants) or the
// several products behind one scanned code. Unavailable options stay visible
// with their reason and cannot be picked; nothing is added automatically.
export default function ScanMatchesDialog({ choice, token, outletId, currency, onClose, onPick }) {
  const variants = useQuery({
    queryKey: ['pos-retail-variants', choice.item?.productId, outletId, token],
    queryFn: () => runly.commerce.variants(choice.item.productId, { outletId }, token),
    enabled: choice.kind === 'variants',
    staleTime: 10_000,
  })
  const options = choice.kind === 'variants'
    ? (variants.data?.data ?? []).filter((v) => v.unavailableReason !== 'DISABLED')
    : choice.matches
  const title = choice.kind === 'variants' ? choice.item.name : `Este código es de ${choice.matches.length} productos`
  const description = choice.kind === 'variants' ? 'Elige la opción que se lleva el cliente.' : `Código ${choice.code}. Elige cuál agregar; todavía no se agregó nada.`

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg" scrollable className="p-0 md:p-0">
        <div className="shrink-0 border-b border-[hsl(var(--border))] px-6 pb-1 pt-5 pr-12">
          <DialogHeader icon={choice.kind === 'variants' ? Layers : Barcode}>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {choice.kind === 'variants' && variants.isPending ? (
            <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
          ) : choice.kind === 'variants' && variants.isError ? (
            <ErrorState title="No se pudieron leer las opciones" description={classifyPosError(variants.error).message} onRetry={variants.refetch} />
          ) : options.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">No hay opciones activas para vender.</p>
          ) : (
            <ul className="space-y-2" aria-label="Opciones">
              {options.map((option) => {
                const reasonId = `reason-${option.id}`
                const label = option.variantLabel ? (choice.kind === 'variants' ? option.variantLabel : `${option.name} · ${option.variantLabel}`) : option.name
                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      disabled={!option.available}
                      aria-describedby={!option.available ? reasonId : undefined}
                      onClick={() => onPick(option)}
                      className={cn(
                        'flex min-h-16 w-full items-center gap-4 rounded-xl border px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
                        option.available ? 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:border-(--brand-primary) hover:bg-(--brand-soft)' : 'cursor-not-allowed border-dashed border-[hsl(var(--input))] bg-[hsl(var(--muted))]',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-[hsl(var(--foreground))]">{label}</span>
                        <span className="block text-xs text-[hsl(var(--muted-foreground))]">{[option.sku && `SKU ${option.sku}`, option.categoryName, option.trackStock && option.stock != null ? `${option.stock} en esta sucursal` : null].filter(Boolean).join(' · ')}</span>
                        {!option.available && (
                          <span id={reasonId} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-red-800 dark:text-red-300">
                            <CircleSlash className="h-3.5 w-3.5" aria-hidden="true" />No se puede agregar: {option.unavailableMessage ?? 'no disponible'}
                          </span>
                        )}
                      </span>
                      <span className="text-lg font-bold tabular-nums text-[hsl(var(--foreground))]">{formatMoney(option.price, option.currency ?? currency)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <div className="flex shrink-0 justify-end border-t border-[hsl(var(--border))] px-6 py-4">
          <Button variant="outline" size="lg" onClick={onClose}>Cancelar</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
