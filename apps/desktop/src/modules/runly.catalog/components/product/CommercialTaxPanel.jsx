// apps/desktop/src/modules/runly.catalog/components/product/CommercialTaxPanel.jsx
import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, ErrorState, SectionCard, SegmentedControl, Skeleton, TextField } from '@runly/ui'
import { Percent } from 'lucide-react'
import { runly } from '../../../../lib/runly.js'
import { classifyCommerceError } from '../../lib/commerceCommand.js'
import { parseTaxRate } from '../../lib/catalogRules.js'
import { useCommerceCommand } from '../../lib/useCommerceCommand.js'
import CommandFailureAlert from '../CommandFailureAlert.jsx'
import ToggleRow from '../ToggleRow.jsx'

const MODE_OPTIONS = [
  { value: 'inherit', label: 'El de POS' },
  { value: 'custom', label: 'Propio' },
]

const describe = (tax) => (tax?.rate == null ? 'sin tasa configurada' : `${Number(tax.rate)} %, ${tax.included ? 'incluido en el precio' : 'se suma al precio'}`)

// C1 commercial tax: an override on the product, or both fields null to
// inherit the POS default. The server reports the effective result.
export default function CommercialTaxPanel({ productId, token, canUpdate }) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['catalog-commercial-tax', productId, token],
    queryFn: () => runly.catalogCommerce.commercialTax(productId, token),
    enabled: Boolean(token),
    staleTime: 15_000,
  })
  const data = query.data?.data
  const [mode, setMode] = useState('inherit')
  const [rate, setRate] = useState('')
  const [included, setIncluded] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!data) return
    setMode(data.inherited ? 'inherit' : 'custom')
    setRate(data.rate != null ? String(Number(data.rate)) : String(Number(data.effective?.rate ?? 0)))
    setIncluded(data.included ?? data.effective?.included ?? true)
  }, [data])

  const command = useCommerceCommand({
    prefix: 'cat-tax',
    run: (body, options) => runly.catalogCommerce.setCommercialTax(productId, body, token, options),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['catalog-commercial-tax', productId] }),
  })

  const parsed = parseTaxRate(rate)
  const dirty = data && (mode === 'inherit'
    ? !data.inherited
    : data.inherited || parsed === null || Number(parsed) !== Number(data.rate) || included !== data.included)

  function save() {
    if (mode === 'inherit') return command.mutate({ rate: null, included: null })
    if (parsed === null) { setError('Escribe una tasa entre 0 y 100, con hasta cuatro decimales.'); return }
    setError('')
    command.mutate({ rate: parsed, included })
  }

  return (
    <SectionCard title="Impuesto" icon={Percent} description="Se usa al cobrar en el punto de venta. Cada venta conserva el impuesto con el que se hizo.">
      {query.isPending ? (
        <Skeleton className="h-24" />
      ) : query.isError ? (
        <ErrorState title="No se pudo leer el impuesto" description={classifyCommerceError(query.error).message} onRetry={query.refetch} />
      ) : (
        <div className="space-y-4">
          <CommandFailureAlert failure={command.failure} onRetry={command.retry} retrying={command.isPending} />
          <SegmentedControl ariaLabel="Origen del impuesto" options={MODE_OPTIONS} value={mode} onChange={setMode} disabled={!canUpdate || command.isPending} />
          {mode === 'custom' && (
            <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
              <TextField label="Tasa (%)" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} error={error} disabled={!canUpdate} icon={null} />
              <ToggleRow id={`tax-included-${productId}`} label="Incluido en el precio" checked={included} onChange={setIncluded} disabled={!canUpdate} />
            </div>
          )}
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Ahora se aplica: <strong className="text-[hsl(var(--foreground))]">{describe(data.effective)}</strong>
            {data.inherited ? ' (del punto de venta).' : ' (propio del producto).'}
          </p>
          {canUpdate && (
            <div className="flex justify-end">
              <Button type="button" size="lg" onClick={save} loading={command.isPending} disabled={!dirty || command.isPending}>Guardar impuesto</Button>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  )
}
