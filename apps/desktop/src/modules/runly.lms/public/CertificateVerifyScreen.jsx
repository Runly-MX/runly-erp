import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Badge, Button, EmptyState, Skeleton } from '@runly/ui'
import { Building2, Download, SearchX, ShieldAlert, ShieldCheck } from 'lucide-react'
import { runly } from '../../../lib/runly.js'
import { getApiUrl } from '../../../lib/runtimeConfig.js'
import { formatHours, formatLongDate, toAbsoluteUrl } from '../lib/lmsCert.js'
import { PUBLIC_VIEWPORT_CLASS, useVisualViewportVars } from './keyboardSafeFocus.js'

const MUTED = 'text-[hsl(var(--muted-foreground))]'

function Brand({ data, loading }) {
  return (
    <header className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
        {data?.logoUrl ? (
          <img src={data.logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-md object-contain" />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--muted))]">
            <Building2 className={`h-4 w-4 ${MUTED}`} aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          {loading ? <Skeleton className="h-4 w-40" /> : <p className="truncate text-sm font-semibold">{data?.companyName || 'Verificación de certificado'}</p>}
        </div>
        <span className={`flex shrink-0 items-center gap-1 text-xs ${MUTED}`}><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />Verificación</span>
      </div>
    </header>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
      <dt className={MUTED}>{label}</dt>
      <dd className="min-w-0 text-right font-medium">{children}</dd>
    </div>
  )
}

function Footer() {
  return <footer className={`mx-auto max-w-xl px-4 pb-8 text-center text-xs ${MUTED}`}>Verificación emitida por Runly</footer>
}

// Anonymous verification page opened from a certificate's QR code, rendered
// inside PublicShell at /app/p/lms/cert/:token. Works signed out.
export default function CertificateVerifyScreen() {
  useVisualViewportVars()
  const { token } = useParams()
  const query = useQuery({
    queryKey: ['public-lms-certificate', token],
    queryFn: async () => {
      const result = await runly.lms.getPublicCertificate(token)
      return result?.data ?? result
    },
    enabled: Boolean(token),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  })
  const data = query.data

  if (query.isError) {
    const notFound = query.error?.status === 404
    const limited = query.error?.status === 429
    return (
      <div className={`${PUBLIC_VIEWPORT_CLASS} overflow-y-auto overscroll-contain bg-[hsl(var(--background))]`}>
        <Brand loading={false} />
        <main className="mx-auto max-w-xl px-4 py-10">
          <EmptyState
            icon={SearchX}
            title={notFound ? 'Certificado no encontrado' : limited ? 'Demasiadas consultas' : 'No se pudo verificar el certificado'}
            description={notFound
              ? 'El enlace no corresponde a ningún certificado. Revisa que esté completo o pide uno nuevo a quien lo emitió.'
              : limited ? 'Espera un momento y vuelve a intentarlo.' : (query.error?.message ?? 'Intenta de nuevo más tarde.')}
          />
        </main>
      </div>
    )
  }

  const revoked = Boolean(data?.revoked)
  const pdfUrl = token ? toAbsoluteUrl(runly.lms.publicCertificatePdfUrl(token), getApiUrl()) : ''
  return (
    <div className={`${PUBLIC_VIEWPORT_CLASS} overflow-y-auto overscroll-contain bg-[hsl(var(--background))]`}>
      <Brand data={data} loading={query.isPending} />
      <main className="mx-auto flex max-w-xl flex-col gap-5 px-4 pb-10 pt-6">
        {query.isPending || !data ? (
          <>
            <Skeleton className="h-16 w-full rounded-md" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-40 w-full rounded-md" />
          </>
        ) : (
          <>
            <div
              role="status"
              className={`flex items-center gap-3 rounded-md border p-4 ${revoked ? 'border-[hsl(var(--destructive)/0.35)] bg-[hsl(var(--destructive)/0.08)]' : 'border-emerald-600/30 bg-emerald-600/10'}`}
            >
              {revoked
                ? <ShieldAlert className="h-6 w-6 shrink-0 text-[hsl(var(--destructive))]" aria-hidden="true" />
                : <ShieldCheck className="h-6 w-6 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />}
              <div className="min-w-0">
                <Badge variant={revoked ? 'destructive' : 'success'}>{revoked ? 'Certificado revocado' : 'Certificado válido'}</Badge>
                <p className={`mt-1 text-sm ${MUTED}`}>
                  {revoked
                    ? `Este certificado fue revocado${data.revokedAt ? ` el ${formatLongDate(data.revokedAt)}` : ''} y ya no es válido.`
                    : `Emitido por ${data.companyName || 'la empresa'} y registrado en su sistema.`}
                </p>
              </div>
            </div>
            <section className="space-y-1">
              <p className={`font-mono text-xs font-medium uppercase tracking-wider ${MUTED}`}>{data.folio}</p>
              <h1 className="text-2xl font-semibold leading-tight tracking-tight">{data.learnerName}</h1>
              <p className={`text-sm ${MUTED}`}>{data.courseTitle}</p>
            </section>
            <dl className="divide-y divide-[hsl(var(--border)/0.6)] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4">
              <Row label="Folio"><span className="font-mono">{data.folio}</span></Row>
              <Row label="Nombre">{data.learnerName}</Row>
              <Row label="Curso">{data.courseTitle}</Row>
              <Row label="Fecha de emisión">{formatLongDate(data.issuedAt) || '—'}</Row>
              <Row label="Duración">{formatHours(data.hours) || '—'}</Row>
              {revoked && data.revokedAt ? <Row label="Revocado">{formatLongDate(data.revokedAt)}</Row> : null}
            </dl>
            {pdfUrl ? (
              <Button asChild variant={revoked ? 'outline' : 'default'} className="w-full rounded-md sm:w-auto sm:self-start">
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer"><Download />Descargar PDF</a>
              </Button>
            ) : null}
          </>
        )}
      </main>
      <Footer />
    </div>
  )
}
