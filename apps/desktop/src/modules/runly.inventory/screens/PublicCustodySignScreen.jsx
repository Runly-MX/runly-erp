import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Skeleton } from '@runly/ui'
import { Ban, CheckCircle2, LinkIcon } from 'lucide-react'
import { useIsDesktop } from '../../../hooks/useIsDesktop.js'
import { runly } from '../../../lib/runly'
import { dataUrlToBase64, parsePublicCustody } from '../lib/custody-api.js'
import {
  BrandBar, CustodyHero, ItemsList, LegalNotice, Parties, SignedSummary, StatusPanel, muted,
} from '../components/custody/PublicCustodyParts.jsx'
import { InlineSigning, MobileSigning } from '../components/custody/PublicCustodySigning.jsx'

function LoadingBody() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
      <Skeleton className="h-40 w-full" />
    </div>
  )
}

// Anonymous signing page for a custody record (resguardo), rendered inside
// PublicShell at /app/p/custody/:token (spec §10.4). The token in the URL is
// the only credential; the API returns only what the signer needs.
export default function PublicCustodySignScreen() {
  const { token } = useParams()
  const isDesktop = useIsDesktop()
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

  let body
  if (query.isError) {
    const expired = [404, 410].includes(query.error?.status)
    body = (
      <StatusPanel icon={LinkIcon} title="Este enlace ya no está disponible"
        description={expired
          ? 'El enlace de firma venció o ya no existe. Pide uno nuevo a quien te entregó el equipo.'
          : (query.error?.message ?? 'No se pudo cargar el resguardo. Intenta de nuevo más tarde.')} />
    )
  } else if (custody?.status === 'CANCELLED') {
    body = (
      <StatusPanel icon={Ban} tone="danger" title="Resguardo cancelado"
        description={`El resguardo ${custody.folio ?? ''} fue cancelado y ya no requiere tu firma.`} />
    )
  } else if (custody && (sign.isSuccess || custody.receiverSigned || custody.status === 'COMPLETED')) {
    const justSigned = sign.isSuccess
    const completed = sign.data?.completed === true
    body = (
      <StatusPanel icon={CheckCircle2} tone="success"
        title={justSigned ? (completed ? 'Resguardo completado' : 'Resguardo firmado') : 'Este resguardo ya está firmado'}
        description={justSigned
          ? (completed
            ? 'Tu firma quedó registrada y el resguardo quedó completado. Recibirás el documento final por correo si tienes uno registrado. Ya puedes cerrar esta página.'
            : 'Tu firma quedó registrada. El resguardo está pendiente de la firma de quien entrega; recibirás el documento final cuando se complete. Ya puedes cerrar esta página.')
          : 'No necesitas hacer nada más. Si crees que es un error, comunícate con quien te entregó el equipo.'}>
        <SignedSummary custody={custody} signedAt={justSigned ? (sign.data?.signedAt ?? new Date().toISOString()) : null} />
      </StatusPanel>
    )
  }

  if (body) {
    return (
      <div className="h-dvh overflow-y-auto overscroll-contain">
        <BrandBar companyName={custody?.companyName} logoUrl={custody?.companyLogoUrl} />
        {body}
      </div>
    )
  }

  const signingProps = {
    signature,
    onChange: setSignature,
    onSign: () => sign.mutate(),
    pending: sign.isPending,
    disabled: query.isLoading,
    error: sign.isError ? (sign.error?.message ?? 'No se pudo registrar la firma. Intenta de nuevo.') : null,
    expiresAt: custody?.expiresAt,
  }

  return (
    <div className="h-dvh overflow-y-auto overscroll-contain">
      <BrandBar companyName={custody?.companyName} logoUrl={custody?.companyLogoUrl} loading={query.isLoading} />
      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 pt-6 pb-32 md:px-8 md:py-10">
        {query.isLoading ? <LoadingBody /> : (
          <>
            <CustodyHero custody={custody} />
            <Parties custody={custody} />
            <ItemsList items={custody.items} count={custody.itemCount} />
            {custody.comments ? (
              <section className="space-y-1.5">
                <h2 className="text-sm font-semibold">Comentarios</h2>
                <p className={`whitespace-pre-line text-sm leading-relaxed ${muted}`}>{custody.comments}</p>
              </section>
            ) : null}
            <LegalNotice isReturn={custody.kind === 'RETURN'} />
            {isDesktop ? <InlineSigning {...signingProps} /> : null}
          </>
        )}
      </main>
      {!isDesktop && !query.isLoading ? <MobileSigning {...signingProps} /> : null}
    </div>
  )
}
