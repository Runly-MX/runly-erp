import { useState } from 'react'
import { Button, SelectField, TextField, UserSearchModal } from '@runly/ui'
import { Loader2, UserRound, X } from 'lucide-react'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { getApiUrl } from '../../../lib/runtimeConfig.js'
import { runly } from '../../../lib/runly.js'
import { useBookingsMutation } from '../hooks/useBookings.js'
import { MUTED_TEXT, RESOURCE_TYPE, optionsOf } from '../lib/bookingsLabels.js'

// Inline "create resource" inside another form (Nuevo servicio): no nested
// <form> and no nested modal, so the host form keeps its state and focus. The
// resource is created in the company catalog and linked to this space at once,
// so the host can select it right away.
export function QuickResourcePanel({ spaceId, linkedIds, onCreated, onCancel, first = false }) {
  const { session } = useAuth()
  const { activeCompanyId } = useActiveCompany()
  const [form, setForm] = useState({ name: '', type: 'staff', userId: null, userName: '' })
  const [error, setError] = useState('')
  const [picking, setPicking] = useState(false)
  const create = useBookingsMutation(async (t, data) => {
    const created = await runly.bookings.createResource(data, t)
    const resource = created?.data ?? created
    await runly.bookings.setSpaceResources(spaceId, [...new Set([...linkedIds, resource.id])], t)
    return resource
  }, { success: (r) => `Recurso «${r.name}» creado y seleccionado.` })

  async function save() {
    if (!form.name.trim()) { setError('Escribe un nombre para el recurso.'); return }
    setError('')
    const resource = await create.mutateAsync({ name: form.name.trim(), type: form.type, userId: form.type === 'staff' ? form.userId : null }).catch(() => null)
    if (resource) onCreated(resource)
  }

  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.35)] p-4 sm:p-5" role="group" aria-label={first ? 'Crear primer recurso' : 'Crear recurso'}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{first ? 'Crear primer recurso' : 'Nuevo recurso'}</p>
          <p className={MUTED_TEXT}>Queda disponible en este sistema y seleccionado para este servicio. Lo que llevas capturado se conserva.</p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Cerrar creación de recurso" onClick={onCancel}><X /></Button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Nombre del recurso" required value={form.name} maxLength={160} placeholder="Ej. Dra. López o Sala 2" autoComplete="off" autoFocus error={error}
          onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); if (error) setError('') }}
          // Enter creates the resource instead of submitting the service form around it.
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save() } }}
        />
        <SelectField label="Tipo" options={optionsOf(RESOURCE_TYPE)} value={form.type} onValueChange={(type) => setForm((f) => ({ ...f, type }))} />
      </div>
      {form.type === 'staff' ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setPicking(true)}><UserRound />{form.userId ? form.userName : 'Vincular usuario de Runly (opcional)'}</Button>
          {form.userId ? <Button type="button" variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, userId: null, userName: '' }))}><X />Quitar vínculo</Button> : null}
        </div>
      ) : null}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={create.isPending}>Cancelar</Button>
        <Button type="button" onClick={save} disabled={create.isPending}>
          {create.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
          {create.isPending ? 'Creando…' : 'Crear y seleccionar'}
        </Button>
      </div>
      {picking ? (
        <UserSearchModal open onClose={() => setPicking(false)} apiBase={getApiUrl()} token={session?.access_token} companyId={activeCompanyId} includeSelf
          title="Vincular usuario" description="La persona que atiende con este recurso." onConfirm={(userId, _role, user) => setForm((f) => ({ ...f, userId, userName: user?.display_name ?? 'Usuario vinculado' }))} />
      ) : null}
    </div>
  )
}
