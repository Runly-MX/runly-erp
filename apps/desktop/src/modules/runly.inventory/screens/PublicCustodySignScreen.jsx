import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button, DataTable, EmptyState, Skeleton, SignaturePad } from '@runly/ui'
import { Ban, Building2, CheckCircle2, LinkIcon } from 'lucide-react'
import { runly } from '../../../lib/runly'
import { CUSTODY_KIND, dataUrlToBase64, formatCustodyDate, parsePublicCustody } from '../lib/custody-api.js'

const ITEM_FIELDS = [
  ['typeBrand', 'Tipo / marca'],
  ['model', 'Modelo'],
  ['serialNumber', 'Serie', true],
  ['assetTag', 'Etiqueta', true],
  ['invoiceNumber', 'Factura'],
  ['features', 'Características'],
]

const muted = 'text-[hsl(var(--muted-foreground))]'

const ITEM_COLUMNS = [
  { accessorKey: 'index', header: '#', enableSorting: false, cell: ({ row }) => <span className={`tabular-nums ${muted}`}>{row.original.index}</span> },
  ...ITEM_FIELDS.map(([key, label, mono]) => ({
    accessorKey: key, header: label, enableSorting: false,
    cell: ({ row }) => <span className={mono ? 'font-mono text-xs' : undefined}>{row.original[key] || '—'}</span>,
  })),
]

function Centered({ children }) {
  return <div className="flex min-h-dvh items-center justify-center bg-[hsl(var(--background))] p-4">{children}</div>
}

function Info({ label, children }) {
  return (
    <div className="min-w-0">
      <p className={`text-xs ${muted}`}>{label}</p>
      <div className="mt-0.5 text-sm font-medium wrap-break-word">{children || '—'}</div>
    </div>
  )
}

// Items as a table on wide screens and as cards on phones.
function ItemsList({ items }) {
  return (
    <>
      <div className="hidden md:block">
        <DataTable columns={ITEM_COLUMNS} data={items} getRowId={(row) => String(row.index)}
          showToolbar={false} showPagination={items.length > 20} emptyTitle="Sin artículos" />
      </div>
      <ul className="space-y-2 md:hidden">
        {items.map((row) => (
          <li key={row.index} className="space-y-2 rounded-md border border-[hsl(var(--border))] p-3">
            <p className="text-sm font-medium">
              <span className={`mr-1.5 tabular-nums ${muted}`}>{row.index}.</span>
              {[row.typeBrand, row.model].filter(Boolean).join(' · ') || 'Artículo'}
            </p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              {ITEM_FIELDS.slice(2).map(([key, label, mono]) => (
                <div key={key} className={key === 'features' ? 'col-span-2' : undefined}>
                  <dt className={muted}>{label}</dt>
                  <dd className={`wrap-break-word ${mono ? 'font-mono' : ''}`}>{row[key] || '—'}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  )
}

// Anonymous signing page for a custody record (resguardo). The token in the
// URL is the only credential; the API returns only what the signer needs.
export default function PublicCustodySignScreen() {
  const { token } = useParams()
  const [signature, setSignature] = useState(null)
  const query = useQuery({
    queryKey: ['public-custody', token],
    queryFn: async () => parsePublicCustody(await runly.inventory.publicCustody.get(token)),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  })
  const sign = useMutation({
    mutationFn: () => runly.inventory.publicCustody.sign(token, dataUrlToBase64(signature)),
  })
  const custody = query.data

  if (query.isError) {
    const expired = [404, 410].includes(query.error?.status)
    return (
      <Centered>
        <EmptyState icon={LinkIcon} title="Este enlace ya no está disponible"
          description={expired ? 'El enlace de firma venció o ya no existe. Pide uno nuevo a quien te entregó el equipo.' : (query.error?.message ?? 'No se pudo cargar el resguardo.')} />
      </Centered>
    )
  }

  if (custody?.status === 'CANCELLED') {
    return (
      <Centered>
        <EmptyState icon={Ban} title="Resguardo cancelado" description="Este resguardo fue cancelado y ya no requiere tu firma." />
      </Centered>
    )
  }

  if (sign.isSuccess || (custody && (custody.receiverSigned || custody.status === 'COMPLETED'))) {
    return (
      <Centered>
        <EmptyState icon={CheckCircle2} title="Resguardo firmado"
          description={`Tu firma del resguardo ${custody?.folio ?? ''} quedó registrada. Ya puedes cerrar esta página.`} />
      </Centered>
    )
  }

  const kindLabel = CUSTODY_KIND[custody?.kind]
  const isReturn = custody?.kind === 'RETURN'
  const receiverRole = [custody?.receiverJobTitle, custody?.receiverDepartment].filter(Boolean).join(' · ')

  return (
    <div className="min-h-dvh bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 md:px-8 md:py-10">
        <header className="flex items-center gap-3 border-b border-[hsl(var(--border))] pb-4">
          {custody?.companyLogoUrl ? (
            <img src={custody.companyLogoUrl} alt="" className="h-12 w-12 shrink-0 rounded-md object-contain" />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--muted))]">
              <Building2 className={`h-5 w-5 ${muted}`} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            {query.isLoading ? <Skeleton className="h-6 w-56" /> : (
              <>
                <p className={`truncate text-xs ${muted}`}>{custody.companyName ?? 'Resguardo de equipo'}</p>
                <h1 className="text-lg font-semibold leading-tight">{kindLabel ? `${kindLabel} de equipo` : 'Resguardo de equipo'}</h1>
              </>
            )}
          </div>
          {custody?.folio ? <span className="shrink-0 rounded-md bg-[hsl(var(--muted))] px-2 py-1 font-mono text-xs">{custody.folio}</span> : null}
        </header>

        {query.isLoading ? <Skeleton className="h-28 w-full" /> : (
          <section className="grid gap-4 rounded-md border border-[hsl(var(--border))] p-4 sm:grid-cols-2">
            <Info label="Tipo">{kindLabel}</Info>
            <Info label="Fecha">{formatCustodyDate(custody.date)}</Info>
            <Info label={isReturn ? 'Recibe la devolución' : 'Entrega'}>{custody.delivererName}</Info>
            <Info label={isReturn ? 'Devuelve' : 'Recibe'}>
              {custody.receiverName}
              {receiverRole ? <span className={`block text-xs font-normal ${muted}`}>{receiverRole}</span> : null}
            </Info>
          </section>
        )}

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">
            Artículos{custody ? <span className={`font-normal ${muted}`}> ({custody.itemCount})</span> : null}
          </h2>
          {query.isLoading ? <Skeleton className="h-32 w-full" /> : <ItemsList items={custody.items} />}
        </section>

        {custody?.comments ? (
          <section className="space-y-1">
            <h2 className="text-sm font-semibold">Comentarios</h2>
            <p className={`whitespace-pre-line text-sm ${muted}`}>{custody.comments}</p>
          </section>
        ) : null}

        <p className={`rounded-md bg-[hsl(var(--muted))] px-3 py-2 text-xs ${muted}`}>
          {isReturn
            ? 'Al firmar confirmas que devuelves los artículos listados y que su estado corresponde a lo descrito.'
            : 'Al firmar confirmas que recibes los artículos listados en buen estado y te haces responsable de su resguardo conforme a las políticas de la empresa.'}
        </p>

        <SignaturePad label="Tu firma" onChange={setSignature} disabled={query.isLoading || sign.isPending} />
        {sign.isError ? <p className="text-sm text-[hsl(var(--destructive))]">{sign.error?.message ?? 'No se pudo registrar la firma. Intenta de nuevo.'}</p> : null}
        <Button size="lg" onClick={() => sign.mutate()} disabled={!signature || sign.isPending || query.isLoading}>
          {sign.isPending ? 'Firmando...' : 'Firmar resguardo'}
        </Button>
        {custody?.expiresAt ? (
          <p className={`text-center text-xs ${muted}`}>
            Este enlace vence el {new Date(custody.expiresAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}.
          </p>
        ) : null}
      </div>
    </div>
  )
}
