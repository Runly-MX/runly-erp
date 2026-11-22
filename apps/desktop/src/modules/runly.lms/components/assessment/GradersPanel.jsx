import { useEffect, useMemo, useState } from 'react'
import { Alert, AlertDescription, Button, ComboboxField, EmptyState, ErrorState, SectionCard, SelectField, Skeleton } from '@runly/ui'
import { Loader2, Plus, Save, Trash2, UserCheck } from 'lucide-react'
import { useUserCandidates } from '../../hooks/useLmsData.js'
import { useAssessmentGraders, useSetGraders } from '../../hooks/useLmsResults.js'

const ROLE_OPTIONS = [{ value: 'grader', label: 'Evaluador' }, { value: 'reader', label: 'Solo lectura' }]
const userName = (user) => user.displayName || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Usuario'

// "Evaluadores" tab: who reviews this evaluation. Without a list, every person
// with the grading or results permission of the company reviews it; with one,
// only the people listed (plus administrators).
export function GradersPanel({ assessmentId, readOnly = false }) {
  const query = useAssessmentGraders(assessmentId)
  const save = useSetGraders(assessmentId)
  const [draft, setDraft] = useState([])
  const [search, setSearch] = useState('')
  const [pick, setPick] = useState('')
  const [role, setRole] = useState('grader')
  const candidates = useUserCandidates(search)
  useEffect(() => { if (query.data) setDraft(query.data.map(({ userProfileId, role: r, name, email }) => ({ userProfileId, role: r, name, email }))) }, [query.data])
  const users = useMemo(() => (candidates.data ?? []).filter((user) => !user.isBot && !user.is_bot && !draft.some((row) => row.userProfileId === user.id)), [candidates.data, draft])
  const dirty = JSON.stringify(draft.map(({ userProfileId, role: r }) => [userProfileId, r])) !== JSON.stringify((query.data ?? []).map(({ userProfileId, role: r }) => [userProfileId, r]))

  function add() {
    const user = users.find((item) => item.id === pick)
    if (!user) return
    setDraft((current) => [...current, { userProfileId: user.id, role, name: userName(user), email: user.email }])
    setPick('')
  }

  if (query.isLoading) return <Skeleton className="h-48 rounded-2xl" />
  if (query.isError) return <ErrorState title="No se pudieron cargar los evaluadores" description={query.error?.message} onRetry={() => query.refetch()} />
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <Alert><AlertDescription>
        Sin lista, califica cualquier persona con el permiso «Calificar actividades y tareas» y consulta cualquiera con «Ver resultados de evaluaciones».
        Con lista, solo las personas que agregues aquí (los administradores de cursos siempre tienen acceso).
      </AlertDescription></Alert>
      <SectionCard title="Personas asignadas">
        <div className="space-y-4">
          {draft.length ? (
            <ul className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))]">
              {draft.map((row) => (
                <li key={row.userProfileId} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{row.name}</p>{row.email ? <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{row.email}</p> : null}</div>
                  <div className="w-40"><SelectField aria-label={`Rol de ${row.name}`} options={ROLE_OPTIONS} value={row.role} disabled={readOnly} onValueChange={(value) => setDraft((current) => current.map((item) => (item.userProfileId === row.userProfileId ? { ...item, role: value } : item)))} /></div>
                  {!readOnly ? <Button variant="ghost" size="icon" className="h-11 w-11 sm:h-9 sm:w-9" aria-label={`Quitar a ${row.name}`} onClick={() => setDraft((current) => current.filter((item) => item.userProfileId !== row.userProfileId))}><Trash2 /></Button> : null}
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={UserCheck} title="Sin evaluadores asignados" description="Revisan quienes tengan los permisos de la empresa." />}
          {!readOnly ? (
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
              <ComboboxField
                label="Agregar persona" placeholder="Buscar por nombre o correo…" value={pick} onValueChange={setPick} onSearchChange={setSearch} filter={false} loading={candidates.isFetching}
                options={users.map((user) => ({ value: user.id, label: userName(user), description: user.email }))}
              />
              <SelectField label="Rol" options={ROLE_OPTIONS} value={role} onValueChange={setRole} />
              <Button variant="outline" onClick={add} disabled={!pick}><Plus />Agregar</Button>
            </div>
          ) : null}
          {!readOnly ? (
            <div className="flex justify-end">
              <Button onClick={() => save.mutate(draft.map(({ userProfileId, role: r }) => ({ userProfileId, role: r })))} disabled={!dirty || save.isPending}>
                {save.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Save />}Guardar evaluadores
              </Button>
            </div>
          ) : null}
        </div>
      </SectionCard>
    </div>
  )
}
