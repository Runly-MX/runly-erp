import { useEffect, useMemo, useState } from 'react'
import { Button, DateField, SectionCard, SelectField, Skeleton } from '@runly/ui'
import { CalendarRange, Loader2, Plus, Trash2 } from 'lucide-react'
import { MUTED_TEXT, WEEKDAYS, WEEKDAY_ORDER } from '../lib/bookingsLabels.js'

const TIMES = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`)
const TIME_OPTIONS = TIMES.map((t) => ({ value: t, label: t }))
let seq = 0
const row = (rule) => ({ key: `r${++seq}`, validFrom: '', validTo: '', ...rule, showValidity: Boolean(rule.validFrom || rule.validTo) })

// Weekly hours of one owner. Several ranges per day express breaks (09:00-13:00
// and 14:00-18:00); a range ending at or before its start crosses midnight.
export function ScheduleEditor({ title, description, rules, loading, canEdit, onSave, saving }) {
  const [draft, setDraft] = useState([])
  const [error, setError] = useState('')
  useEffect(() => { setDraft((rules ?? []).map(row)); setError('') }, [rules])
  const byDay = useMemo(() => Object.fromEntries(WEEKDAY_ORDER.map((d) => [d, draft.filter((r) => r.weekday === d)])), [draft])
  const dirty = JSON.stringify(draft.map(({ weekday, startTime, endTime, validFrom, validTo }) => [weekday, startTime, endTime, validFrom || null, validTo || null]))
    !== JSON.stringify((rules ?? []).map(({ weekday, startTime, endTime, validFrom, validTo }) => [weekday, startTime, endTime, validFrom || null, validTo || null]))

  const update = (key, patch) => setDraft((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const add = (weekday) => setDraft((list) => [...list, row({ weekday, startTime: '09:00', endTime: '18:00' })])
  const remove = (key) => setDraft((list) => list.filter((r) => r.key !== key))
  const copyToWeekdays = (weekday) => setDraft((list) => {
    const source = list.filter((r) => r.weekday === weekday)
    return [...list.filter((r) => r.weekday === weekday || r.weekday === 0 || r.weekday === 6), ...[1, 2, 3, 4, 5].filter((d) => d !== weekday).flatMap((d) => source.map((r) => row({ ...r, weekday: d })))]
  })

  async function save() {
    const bad = draft.find((r) => r.startTime === r.endTime || (r.validFrom && r.validTo && r.validTo < r.validFrom))
    if (bad) { setError(`Revisa el horario del ${WEEKDAYS[bad.weekday].toLowerCase()}: el inicio y el fin no pueden ser iguales y la vigencia debe terminar después de empezar.`); return }
    setError('')
    await onSave(draft.map(({ weekday, startTime, endTime, validFrom, validTo }) => ({ weekday, startTime, endTime, validFrom: validFrom || null, validTo: validTo || null })))
  }

  return (
    <SectionCard title={title} description={description} icon={CalendarRange}>
      {loading ? <Skeleton className="h-48 w-full" /> : (
        <div className="space-y-3">
          {WEEKDAY_ORDER.map((day) => (
            <div key={day} className="rounded-md border border-[hsl(var(--border))] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">{WEEKDAYS[day]}</p>
                {canEdit ? (
                  <div className="flex flex-wrap gap-1">
                    {byDay[day].length && day >= 1 && day <= 5 ? <Button type="button" variant="ghost" size="sm" onClick={() => copyToWeekdays(day)}>Copiar a lunes-viernes</Button> : null}
                    <Button type="button" variant="outline" size="sm" onClick={() => add(day)}><Plus />Agregar horario</Button>
                  </div>
                ) : null}
              </div>
              {byDay[day].length ? (
                <ul className="mt-2 space-y-2">
                  {byDay[day].map((r) => (
                    <li key={r.key} className="space-y-2">
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="min-w-0 flex-1 sm:w-40 sm:flex-none">
                          <SelectField label="Desde" icon={null} options={TIME_OPTIONS} value={r.startTime} onValueChange={(startTime) => update(r.key, { startTime })} disabled={!canEdit} />
                        </div>
                        <div className="min-w-0 flex-1 sm:w-40 sm:flex-none">
                          <SelectField label="Hasta" icon={null} options={TIME_OPTIONS} value={r.endTime} onValueChange={(endTime) => update(r.key, { endTime })} disabled={!canEdit} />
                        </div>
                        {canEdit ? <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={`Quitar horario del ${WEEKDAYS[day].toLowerCase()}`} onClick={() => remove(r.key)}><Trash2 /></Button> : null}
                        {canEdit && !r.showValidity ? <Button type="button" variant="ghost" size="sm" className="h-11 basis-full justify-start sm:basis-auto" onClick={() => update(r.key, { showValidity: true })}>Vigencia</Button> : null}
                      </div>
                      {r.endTime <= r.startTime && r.endTime !== r.startTime ? <p className={MUTED_TEXT}>Termina al día siguiente.</p> : null}
                      {r.showValidity ? (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[12rem_12rem]">
                          <DateField label="Vigente desde" value={r.validFrom} onChange={(e) => update(r.key, { validFrom: e.target.value })} disabled={!canEdit} />
                          <DateField label="Vigente hasta" value={r.validTo} onChange={(e) => update(r.key, { validTo: e.target.value })} disabled={!canEdit} />
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : <p className={`${MUTED_TEXT} mt-1`}>Cerrado</p>}
            </div>
          ))}
          {error ? <p role="alert" className="text-sm text-[hsl(var(--destructive))]">{error}</p> : null}
          {canEdit ? (
            <div className="flex items-center justify-end gap-3">
              {dirty ? <span className={MUTED_TEXT}>Cambios sin guardar</span> : null}
              <Button type="button" onClick={save} disabled={!dirty || saving}>
                {saving ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
                {saving ? 'Guardando…' : 'Guardar horario'}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </SectionCard>
  )
}
