import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button, Skeleton } from '@runly/ui'
import { Building2, ImageOff, LinkIcon, MapPin, Pencil, ShieldCheck, ExternalLink } from 'lucide-react'
import { useAuth } from '../../../auth/AuthProvider'
import { runly } from '../../../lib/runly'
import { InventoryAdminStatusBadge } from '../components/InventoryAdminStatusBadge.jsx'
import { InventoryStatusBadge } from '../components/InventoryStatusBadge.jsx'
import { StatusPanel, muted } from '../components/custody/PublicCustodyParts.jsx'

const ITEM_PATH = '/app/m/runly.inventory/inventory'
const money = (value) => (value == null ? null : Number(value).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }))

function Brand({ item, loading }) {
  return (
    <header className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
        {item?.companyLogoUrl ? (
          <img src={item.companyLogoUrl} alt="" className="h-9 w-9 shrink-0 rounded-md object-contain" />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--muted))]">
            <Building2 className={`h-4 w-4 ${muted}`} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          {loading ? <Skeleton className="h-4 w-40" /> : <p className="truncate text-sm font-semibold">{item?.companyName || 'Equipo'}</p>}
        </div>
        <span className={`flex shrink-0 items-center gap-1 text-xs ${muted}`}><ShieldCheck className="h-3.5 w-3.5" />Enlace seguro</span>
      </div>
    </header>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
      <dt className={muted}>{label}</dt>
      <dd className="min-w-0 text-right font-medium">{children}</dd>
    </div>
  )
}

// Anonymous page opened from an item's QR label, rendered inside PublicShell at
// /app/p/inv/:token. The API returns only the fields the company allows.
export default function PublicInventoryItemScreen() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const query = useQuery({
    queryKey: ['public-inventory-item', token],
    queryFn: async () => (await runly.inventory.labels.publicItem(token))?.item,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  })
  const item = query.data

  if (query.isError) {
    const invalid = [404, 410].includes(query.error?.status)
    return (
      <div className="h-dvh overflow-y-auto overscroll-contain">
        <Brand loading={false} />
        <StatusPanel icon={LinkIcon} title={invalid ? 'Enlace no válido' : 'No se pudo cargar el equipo'}
          description={invalid
            ? 'Este enlace no existe o fue revocado. Si escaneaste una etiqueta, pide que la reimpriman.'
            : (query.error?.message ?? 'Intenta de nuevo más tarde.')} />
      </div>
    )
  }

  const rows = item ? [
    item.locationName !== undefined && ['Ubicación', item.locationName ? <span key="l" className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{item.locationName}</span> : '—'],
    item.serialNumber !== undefined && ['Número de serie', <span key="s" className="font-mono">{item.serialNumber || '—'}</span>],
    item.holderName !== undefined && ['Responsable', item.holderName || 'Sin asignar'],
    item.purchasePrice !== undefined && ['Costo de compra', money(item.purchasePrice) ?? '—'],
  ].filter(Boolean) : []

  return (
    <div className="h-dvh overflow-y-auto overscroll-contain">
      <Brand item={item} loading={query.isLoading} />
      <main className="mx-auto flex max-w-xl flex-col gap-5 px-4 pb-36 pt-5">
        {query.isLoading ? (
          <>
            <Skeleton className="aspect-[4/3] w-full rounded-md" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-24 w-full" />
          </>
        ) : (
          <>
            {'photoUrl' in item ? (
              <div className="aspect-[4/3] w-full overflow-hidden rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
                {item.photoUrl ? (
                  <img src={item.photoUrl} alt={item.name} className="h-full w-full object-cover" />
                ) : (
                  <div className={`flex h-full w-full flex-col items-center justify-center gap-2 text-xs ${muted}`}>
                    <ImageOff className="h-8 w-8" />Sin foto
                  </div>
                )}
              </div>
            ) : null}
            <section className="space-y-2">
              {item.folio ? <p className="font-mono text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">{item.folio}</p> : null}
              <h1 className="text-2xl font-semibold leading-tight tracking-tight">{item.name}</h1>
              {item.status !== undefined || item.adminStatus !== undefined ? (
                <div className="flex flex-wrap items-center gap-2">
                  <InventoryAdminStatusBadge status={item.adminStatus} size="md" />
                  <InventoryStatusBadge status={item.status} size="md" />
                </div>
              ) : null}
            </section>
            {rows.length ? (
              <dl className="divide-y divide-[hsl(var(--border)/0.6)] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4">
                {rows.map(([label, value]) => <Row key={label} label={label}>{value}</Row>)}
              </dl>
            ) : null}
          </>
        )}
      </main>
      {item ? (
        <div className="fixed inset-x-0 bottom-0 border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 pb-[max(1rem,var(--sab))] pt-3">
          <div className="mx-auto max-w-xl space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" onClick={() => navigate(`${ITEM_PATH}/${item.itemId}`)}>
                <ExternalLink className="mr-2 h-4 w-4" />Ver detalles
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate(`${ITEM_PATH}/${item.itemId}/edit`)}>
                <Pencil className="mr-2 h-4 w-4" />Editar
              </Button>
            </div>
            {!session ? <p className={`text-center text-xs ${muted}`}>Para ver más detalles o editar, inicia sesión con tu cuenta de la empresa.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
