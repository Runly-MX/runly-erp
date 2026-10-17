import { useEffect, useMemo, useState } from 'react'
import {
  Button, CheckboxField, DateField, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  EmptyState, ErrorState, SearchInput, Skeleton, cn,
} from '@runly/ui'
import { Loader2, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useAssign, useUserCandidates } from '../hooks/useLmsData.js'
import { dueDateToIso } from '../lib/lmsLabels.js'

const SEARCH_DEBOUNCE_MS = 250

function useDebounced(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

const userName = (user) => user.displayName || [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Usuario'

function summary({ created = 0, reactivated = 0, skipped = 0 } = {}) {
  const parts = []
  if (created) parts.push(`${created} ${created === 1 ? 'asignado' : 'asignados'}`)
  if (reactivated) parts.push(`${reactivated} ${reactivated === 1 ? 'reactivado' : 'reactivados'}`)
  if (skipped) parts.push(`${skipped} ya ${skipped === 1 ? 'estaba inscrito' : 'estaban inscritos'}`)
  return parts.length ? `Listo: ${parts.join(', ')}.` : 'Sin cambios.'
}

// Picks company users (MirAI and other bots excluded) and assigns the course
// with an optional due date. Users already active/completed are shown disabled.
export function AssignLearnersDialog({ open, onOpenChange, courseId, enrollments }) {
  const assign = useAssign()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [dueDate, setDueDate] = useState('')
  const search = useDebounced(query.trim(), SEARCH_DEBOUNCE_MS)
  const candidates = useUserCandidates(search, { enabled: open })
  useEffect(() => { if (open) { setQuery(''); setSelected(new Set()); setDueDate('') } }, [open])

  const enrolled = useMemo(() => new Set((enrollments ?? [])
    .filter((item) => item.status !== 'dropped')
    .map((item) => item.learner?.userProfileId)
    .filter(Boolean)), [enrollments])
  const users = (candidates.data ?? []).filter((user) => !user.isBot && !user.is_bot)

  const toggle = (id) => setSelected((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  async function submit() {
    try {
      const result = await assign.mutateAsync({ courseId, userProfileIds: [...selected], dueAt: dueDateToIso(dueDate) })
      toast.success(summary(result))
      onOpenChange(false)
    } catch { /* toast shown by the mutation */ }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="lg" className="gap-0 p-0 md:p-0 md:pt-0!">
        <DialogHeader icon={UserPlus} className="mb-0 shrink-0 px-5 pt-4 pb-3">
          <DialogTitle>Asignar alumnos</DialogTitle>
          <DialogDescription>Elige a las personas que deben tomar el curso. Verán el curso en «Mis cursos».</DialogDescription>
        </DialogHeader>
        <div className="shrink-0 space-y-3 border-b border-[hsl(var(--border))] px-5 pb-3">
          <SearchInput value={query} onChange={(event) => setQuery(event.target.value)} onClear={() => setQuery('')} placeholder="Buscar por nombre o correo…" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {candidates.isLoading ? (
            <div className="space-y-2 p-2">{[1, 2, 3, 4].map((key) => <Skeleton key={key} className="h-10 rounded-md" />)}</div>
          ) : candidates.isError ? (
            <ErrorState title="No se pudieron cargar los usuarios" description={candidates.error?.message} onRetry={() => candidates.refetch()} />
          ) : !users.length ? (
            <EmptyState icon={Users} title="Sin resultados" description={search ? `Nadie coincide con «${search}».` : 'No hay usuarios disponibles.'} />
          ) : (
            <ul className="space-y-0.5">
              {users.map((user) => {
                const already = enrolled.has(user.id)
                const checked = already || selected.has(user.id)
                return (
                  <li key={user.id} className={cn('rounded-md px-2 py-2', selected.has(user.id) ? 'bg-[hsl(var(--muted))]' : 'hover:bg-[hsl(var(--muted)/0.6)]')}>
                    <CheckboxField
                      id={`lms-assign-${user.id}`}
                      label={userName(user)}
                      hint={already ? 'Ya está inscrito en este curso' : user.email || undefined}
                      checked={checked}
                      disabled={already}
                      onChange={() => toggle(user.id)}
                    />
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <div className="shrink-0 border-t border-[hsl(var(--border))] px-5 pt-3">
          <DateField label="Fecha límite (opcional)" value={dueDate} onChange={(event) => setDueDate(event.target.value)} placeholder="Sin fecha límite" />
        </div>
        <DialogFooter className="mt-0 shrink-0 px-5 py-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={!selected.size || assign.isPending}>
            {assign.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
            {selected.size ? `Asignar a ${selected.size}` : 'Asignar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
