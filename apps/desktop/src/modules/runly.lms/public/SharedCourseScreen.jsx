import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Button, EmptyState, Skeleton } from '@runly/ui'
import { Link2Off, UserX } from 'lucide-react'
import { KEY } from '../hooks/useLmsData.js'
import { useGuestOutline, useSharedCourse } from '../hooks/useLmsShare.js'
import { guestCourseKey, readGuestToken, writeGuestToken } from '../lib/lmsShare.js'
import { SharedCourseJoin } from './SharedCourseJoin.jsx'
import { SharedCoursePlayer } from './SharedCoursePlayer.jsx'

const code = (error) => error?.details?.code ?? null

function Centered({ children }) {
  return <div className="flex min-h-dvh items-center justify-center p-6">{children}</div>
}

// Public course share link (/app/p/lms/curso/:token), signed out and without the
// app shell. External guests type their name (email optional) and get a reduced
// player over the shared lessons. The guest token lives in localStorage keyed by
// the share token; "No soy <nombre>" forgets it and starts over. Invite-only
// links ask for the emailed access code instead (`?i=` is the personal link).
export default function SharedCourseScreen() {
  const { token } = useParams()
  const [search] = useSearchParams()
  const linkToken = /^[A-Za-z0-9_-]{32}$/.test(search.get('i') ?? '') ? search.get('i') : null
  const client = useQueryClient()
  const [guestToken, setGuestToken] = useState(() => readGuestToken(token))
  const summary = useSharedCourse(token)
  const me = useGuestOutline(token, guestToken)

  const remember = (value) => {
    writeGuestToken(token, value)
    setGuestToken(value)
    if (!value) client.removeQueries({ queryKey: [KEY, 'outline', guestCourseKey(token)] })
  }

  // A stale or foreign guest token: forget it and show the join form.
  const staleGuest = Boolean(guestToken) && me.isError && (me.error?.status === 401 || code(me.error) === 'GUEST_REQUIRED')
  useEffect(() => {
    if (staleGuest) remember(null)
  }, [staleGuest]) // eslint-disable-line react-hooks/exhaustive-deps

  if (summary.isError) {
    const limited = summary.error?.status === 429
    return (
      <Centered>
        <EmptyState
          icon={Link2Off}
          title={limited ? 'Demasiadas solicitudes' : summary.error?.status === 404 ? 'Este enlace no está disponible' : 'No se pudo abrir el curso'}
          description={limited
            ? 'Espera un momento y vuelve a intentarlo.'
            : summary.error?.status === 404
              ? 'El enlace se desactivó, cambió o el curso ya no está publicado. Pide uno nuevo a quien te lo compartió.'
              : summary.error?.message}
          action={limited || summary.error?.status !== 404 ? <Button variant="outline" onClick={() => summary.refetch()}>Reintentar</Button> : null}
        />
      </Centered>
    )
  }

  if (staleGuest) return null
  if (guestToken && me.isError && code(me.error) === 'GUEST_REMOVED') {
    return (
      <Centered>
        <EmptyState
          icon={UserX} title="Tu acceso a este curso fue retirado"
          description="Si crees que es un error, pide a quien te compartió el curso que te vuelva a dar acceso."
          action={<Button variant="outline" onClick={() => remember(null)}>{summary.data?.settings?.accessMode === 'invite' ? 'Volver' : 'Entrar con otro nombre'}</Button>}
        />
      </Centered>
    )
  }

  if (!summary.data && summary.fetchStatus === 'paused') {
    return (
      <Centered>
        <EmptyState
          icon={Link2Off} title="Sin conexión"
          description="No pudimos conectarnos para abrir el curso. Revisa tu conexión a internet."
          action={<Button variant="outline" onClick={() => summary.refetch()}>Reintentar</Button>}
        />
      </Centered>
    )
  }

  // isPending, not isLoading: a paused query (flaky network) is pending without
  // fetching, and isLoading would be false while there is still no data.
  if (summary.isPending || !summary.data || (guestToken && me.isPending)) {
    return (
      <div className="min-h-dvh">
        <Skeleton className="h-72 w-full rounded-none" />
        <div className="mx-auto max-w-3xl space-y-3 p-6"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-32 w-full rounded-md" /></div>
      </div>
    )
  }

  if (guestToken && me.data) {
    return <SharedCoursePlayer shareToken={token} guestToken={guestToken} data={me.data} onSignOut={() => remember(null)} />
  }
  if (guestToken && me.isError) {
    return (
      <Centered>
        <EmptyState
          icon={Link2Off} title="No se pudo cargar el curso" description={me.error?.message}
          action={<Button variant="outline" onClick={() => me.refetch()}>Reintentar</Button>}
        />
      </Centered>
    )
  }
  return <SharedCourseJoin shareToken={token} data={summary.data} linkToken={linkToken} onJoined={remember} />
}
