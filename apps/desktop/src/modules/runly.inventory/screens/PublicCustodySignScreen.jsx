import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button, EmptyState, Skeleton, SignaturePad } from '@runly/ui'
import { CheckCircle2, LinkIcon } from 'lucide-react'
import { runly } from '../../../lib/runly'
import { CUSTODY_KIND, dataUrlToBase64, formatCustodyDate, itemDescription, parsePublicCustody } from '../lib/custody-api.js'

function Centered({ children }) {
  return <div className="flex min-h-dvh items-center justify-center bg-[hsl(var(--background))] p-4">{children}</div>
}

// Anonymous signing page for a custody record (resguardo). The token in the
// URL is the only credential; the API returns minimal data.
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

  if (sign.isSuccess || (custody && (custody.receiverSigned || custody.status === 'COMPLETED'))) {
    return (
      <Centered>
        <EmptyState icon={CheckCircle2} title="Resguardo firmado"
          description={`Tu firma del resguardo ${custody?.folio ?? ''} quedó registrada. Ya puedes cerrar esta página.`} />
      </Centered>
    )
  }

  if (custody && custody.status === 'CANCELLED') {
    return (
      <Centered>
        <EmptyState icon={LinkIcon} title="Resguardo cancelado" description="Este resguardo fue cancelado y ya no requiere tu firma." />
      </Centered>
    )
  }

  return (
    <div className="min-h-dvh bg-[hsl(var(--background))]">
      <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4 md:p-8">
        <header className="flex items-center gap-3">
          {custody?.companyLogoUrl ? <img src={custody.companyLogoUrl} alt="" className="h-10 w-10 shrink-0 rounded-md object-contain" /> : null}
          <div className="min-w-0">
            {query.isLoading ? <Skeleton className="h-5 w-56" /> : (
              <>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{custody.companyName ?? 'Resguardo de equipo'}</p>
                <h1 className="text-lg font-semibold">
                  {CUSTODY_KIND[custody.kind] ? `${CUSTODY_KIND[custody.kind]} de equipo` : 'Resguardo'} {custody.folio}
                </h1>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  {custody.receiverName ? `${custody.receiverName} · ` : ''}{formatCustodyDate(custody.date)}
                </p>
              </>
            )}
          </div>
        </header>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Artículos</h2>
          {query.isLoading ? <Skeleton className="h-24 w-full" /> : (
            <ul className="divide-y divide-[hsl(var(--border)/0.6)] rounded-md border border-[hsl(var(--border))]">
              {custody.items.map((row, index) => (
                <li key={`${row.assetTag ?? ''}-${index}`} className="flex flex-col gap-0.5 px-3 py-2 text-sm">
                  <span className="font-medium">{itemDescription(row)}</span>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">
                    {[row.serialNumber && `Serie ${row.serialNumber}`, row.assetTag && `Etiqueta ${row.assetTag}`].filter(Boolean).join(' · ') || '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="rounded-md bg-[hsl(var(--muted))] px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">
          Al firmar confirmas que recibes (o devuelves) los artículos listados en buen estado y te haces responsable de su resguardo conforme a las políticas de la empresa.
        </p>

        <SignaturePad label="Tu firma" onChange={setSignature} disabled={query.isLoading || sign.isPending} />
        {sign.isError ? <p className="text-sm text-[hsl(var(--destructive))]">{sign.error?.message ?? 'No se pudo registrar la firma. Intenta de nuevo.'}</p> : null}
        <Button size="lg" onClick={() => sign.mutate()} disabled={!signature || sign.isPending || query.isLoading}>
          {sign.isPending ? 'Firmando...' : 'Firmar'}
        </Button>
        {custody?.expiresAt ? (
          <p className="text-center text-xs text-[hsl(var(--muted-foreground))]">
            Este enlace vence el {new Date(custody.expiresAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}.
          </p>
        ) : null}
      </div>
    </div>
  )
}
