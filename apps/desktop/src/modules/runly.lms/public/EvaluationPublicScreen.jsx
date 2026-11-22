import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Button, EmptyState, Skeleton } from '@runly/ui'
import { Link2Off, LogOut, UserX } from 'lucide-react'
import { toast } from 'sonner'
import { runly } from '../../../lib/runly.js'
import { RunnerIntro } from '../components/runner/RunnerParts.jsx'
import { SessionView } from '../components/runner/SessionView.jsx'
import { forgetEvaluation, useEvaluationLink, useEvaluationMe, useEvaluationStart } from '../hooks/useEvaluationLink.js'
import { SessionSourceContext, bindSessionSource } from '../hooks/useSessionSource.js'
import { readGuestToken, writeGuestToken } from '../lib/lmsShare.js'
import { EvaluationEntry } from './EvaluationEntry.jsx'
import { EvaluationInfo } from './EvaluationInfo.jsx'
import { PUBLIC_PAGE_CLASS } from './keyboardSafeFocus.js'

const code = (error) => error?.details?.code ?? null
const storageKey = (linkToken) => `evaluacion:${linkToken}`

function Centered({ children }) {
  return <div className="flex min-h-dvh items-center justify-center p-6">{children}</div>
}

function LinkProblem({ error, onRetry }) {
  const limited = error?.status === 429
  const gone = error?.status === 404
  return (
    <Centered>
      <EmptyState
        icon={Link2Off}
        title={limited ? 'Demasiadas solicitudes' : gone ? 'Este enlace no está disponible' : 'No se pudo abrir la evaluación'}
        description={limited ? 'Espera un momento y vuelve a intentarlo.' : gone ? 'El enlace se desactivó, cambió o la evaluación ya no está publicada. Pide uno nuevo a quien te lo compartió.' : error?.message}
        action={!gone ? <Button variant="outline" onClick={onRetry}>Reintentar</Button> : null}
      />
    </Centered>
  )
}

// A registered participant: the shared runner over the guest transport. The
// clock starts only from RunnerIntro's confirmation; reloading resumes the
// open session (the server keeps one per person).
function GuestRunner({ linkToken, guestToken, me, onSignOut }) {
  const start = useEvaluationStart(linkToken, guestToken)
  const [startedId, setStartedId] = useState(null)
  const source = useMemo(() => bindSessionSource(runly.lms.evaluationGuest, guestToken), [guestToken])
  const sessionId = startedId ?? me.openSessionId ?? (!me.canStart && me.sessions[0]?.id) ?? null

  async function begin() {
    try {
      const result = await start.mutateAsync()
      setStartedId(result?.session?.id ?? null)
    } catch (error) { toast.error(error.message || 'No se pudo iniciar la evaluación.') }
  }

  return (
    <SessionSourceContext.Provider value={source}>
      <div className={PUBLIC_PAGE_CLASS}>
        {sessionId ? <SessionView sessionId={sessionId} onExit={null} /> : (
          <>
            <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 pt-[max(1rem,var(--sat))] sm:px-6">
              <p className="min-w-0 truncate text-sm text-[hsl(var(--muted-foreground))]">Registrado como <span className="font-medium text-[hsl(var(--foreground))]">{me.guest?.name}</span></p>
              <Button variant="ghost" size="sm" onClick={onSignOut}><LogOut />No soy yo</Button>
            </div>
            <RunnerIntro overview={me} onStart={begin} starting={start.isPending} />
          </>
        )}
      </div>
    </SessionSourceContext.Provider>
  )
}

// Public evaluation link (/app/p/lms/evaluacion/:token), signed out and without
// the app shell: information, registration (or invitation code), then the same
// runner internal participants use. The guest token lives in this browser only;
// another device continues with a code sent by email.
export default function EvaluationPublicScreen() {
  const { token } = useParams()
  const [search] = useSearchParams()
  const inviteLink = /^[A-Za-z0-9_-]{32}$/.test(search.get('i') ?? '') ? search.get('i') : null
  const client = useQueryClient()
  const [guestToken, setGuestToken] = useState(() => readGuestToken(storageKey(token)))
  const link = useEvaluationLink(token)
  const me = useEvaluationMe(token, guestToken)

  const remember = (value) => {
    writeGuestToken(storageKey(token), value)
    setGuestToken(value)
    if (!value) forgetEvaluation(client, token)
  }

  // A stale token (signed out by another device, or unknown here): back to the entry.
  const stale = Boolean(guestToken) && me.isError && me.error?.status === 401
  useEffect(() => { if (stale) remember(null) }, [stale]) // eslint-disable-line react-hooks/exhaustive-deps

  if (link.isError) return <LinkProblem error={link.error} onRetry={() => link.refetch()} />
  if (stale) return null
  if (guestToken && me.isError && code(me.error) === 'GUEST_REMOVED') {
    return (
      <Centered>
        <EmptyState
          icon={UserX} title="Tu acceso a esta evaluación fue retirado"
          description="Si crees que es un error, comunícate con quien te compartió la evaluación."
          action={<Button variant="outline" onClick={() => remember(null)}>Volver</Button>}
        />
      </Centered>
    )
  }
  if (link.isPending || !link.data || (guestToken && me.isPending)) {
    return <div className="min-h-dvh"><Skeleton className="h-48 w-full rounded-none" /><div className="mx-auto max-w-5xl space-y-3 p-6"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-40 w-full rounded-md" /></div></div>
  }
  if (guestToken && me.data) return <GuestRunner linkToken={token} guestToken={guestToken} me={me.data} onSignOut={() => remember(null)} />
  if (guestToken && me.isError) return <LinkProblem error={me.error} onRetry={() => me.refetch()} />

  return (
    <div className={PUBLIC_PAGE_CLASS}>
      <EvaluationInfo
        data={link.data}
        aside={<EvaluationEntry linkToken={token} inviteLink={inviteLink} data={link.data} onJoined={remember} onNoticeChanged={() => link.refetch()} />}
      />
    </div>
  )
}
