// apps/desktop/src/modules/runly.pos/components/PosDeviceAccess.jsx
//
// Administración > Cajas y pagos: registers opened from a link (no ERP login)
// and the cashier PINs used on them.
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button, Card, CardContent, CardDescription, CardHeader, CardTitle, ConfirmDialog, DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuTrigger, EmptyState, ErrorState, SelectField, Skeleton, StatusPill, TextField,
} from '@runly/ui'
import { Copy, Ellipsis, KeyRound, Link2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../../auth/AuthProvider'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { runly } from '../../../lib/runly'
import FormDialog from '../../runly.catalog/components/FormDialog.jsx'
import { usePosTerminals } from '../hooks/usePosSettings.js'

const linkUrl = (token) => `${window.location.origin}/app/p/pos/${token}`

function useScope() {
  const { session } = useAuth()
  const { activeCompanyId } = useActiveCompany()
  return { token: session?.access_token, companyId: activeCompanyId }
}

export default function PosDeviceAccess() {
  return (
    <div className="flex flex-col gap-6">
      <DeviceLinks />
      <OperatorPins />
    </div>
  )
}

function DeviceLinks() {
  const { token, companyId } = useScope()
  const qc = useQueryClient()
  const { data: terminals = [] } = usePosTerminals()
  const links = useQuery({ queryKey: ['pos-device-links', companyId, token], queryFn: () => runly.pos.deviceLinks.list(token), enabled: Boolean(token && companyId), refetchInterval: 5000 })
  const [creating, setCreating] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [codes, setCodes] = useState({})
  const refresh = () => qc.invalidateQueries({ queryKey: ['pos-device-links'] })
  const action = useMutation({
    mutationFn: ({ kind, id, code }) => kind === 'approve' ? runly.pos.deviceLinks.approve(id, code, token) : kind === 'reset' ? runly.pos.deviceLinks.reset(id, token) : runly.pos.deviceLinks.revoke(id, token),
    onSuccess: (_, { kind }) => { toast.success(kind === 'approve' ? 'Dispositivo autorizado' : kind === 'reset' ? 'Enlace restablecido' : 'Enlace desactivado'); refresh() },
    onError: (e) => toast.error(e?.message ?? 'No se pudo completar.'),
  })
  const rows = links.data?.data ?? []

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Acceso por enlace</CardTitle>
          <CardDescription>Abre una caja en cualquier tableta o computadora sin entrar al ERP. El dispositivo se autoriza una vez y cada cajero entra con su PIN.</CardDescription>
        </div>
        <Button onClick={() => setCreating(true)} disabled={!terminals.some((t) => t.enabled !== false)}><Plus className="h-4 w-4" aria-hidden="true" />Nuevo enlace</Button>
      </CardHeader>
      <CardContent>
        {links.isPending ? <Skeleton className="h-24" /> : links.isError ? <ErrorState title="No se pudieron cargar los enlaces" description={links.error?.message} onRetry={links.refetch} />
          : rows.length === 0 ? <EmptyState icon={Link2} title="Sin enlaces" description="Crea un enlace para una caja y ábrelo en el dispositivo del mostrador." />
            : (
              <ul className="divide-y divide-[hsl(var(--border))]">
                {rows.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[hsl(var(--foreground))]">{row.name}</p>
                      <p className="text-sm text-[hsl(var(--muted-foreground))]">{row.outletName} · {row.terminalName}{row.lastSeenAt ? ` · usado ${new Date(row.lastSeenAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}` : ''}</p>
                    </div>
                    {row.paired ? <StatusPill tone="success">Dispositivo autorizado</StatusPill>
                      : row.pairingPending ? <StatusPill tone="warning">Esperando aprobación{row.pairingLabel ? ` · ${row.pairingLabel}` : ''}</StatusPill>
                        : <StatusPill tone="neutral">Sin dispositivo</StatusPill>}
                    {row.pairingPending && (
                      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); action.mutate({ kind: 'approve', id: row.id, code: codes[row.id] ?? '' }) }}>
                        <TextField label="Código del dispositivo" value={codes[row.id] ?? ''} onChange={(e) => setCodes((c) => ({ ...c, [row.id]: e.target.value.replace(/\D/g, '').slice(0, 6) }))} inputMode="numeric" icon={null} className="w-36" />
                        <Button type="submit" loading={action.isPending} disabled={(codes[row.id] ?? '').length !== 6}>Autorizar</Button>
                      </form>
                    )}
                    <Button variant="outline" onClick={() => navigator.clipboard?.writeText(linkUrl(row.linkToken)).then(() => toast.success('Enlace copiado'), () => toast.error('No se pudo copiar.'))}>
                      <Copy className="h-4 w-4" aria-hidden="true" />Copiar enlace
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Más acciones de ${row.name}`}><Ellipsis className="h-5 w-5" aria-hidden="true" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem className="min-h-11" onSelect={() => setConfirm({ kind: 'reset', row })}>Restablecer dispositivo</DropdownMenuItem>
                        <DropdownMenuItem className="min-h-11 text-red-700" onSelect={() => setConfirm({ kind: 'revoke', row })}>Desactivar enlace</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>
            )}
      </CardContent>
      {creating && <NewLinkDialog terminals={terminals.filter((t) => t.enabled !== false)} token={token} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); refresh() }} />}
      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(v) => !v && setConfirm(null)}
        tone="destructive"
        icon={Link2}
        title={confirm?.kind === 'reset' ? 'Restablecer dispositivo' : 'Desactivar enlace'}
        description={confirm?.kind === 'reset'
          ? 'El dispositivo actual deja de tener acceso y quien esté cobrando vuelve a la pantalla de autorización. El enlace sigue sirviendo para autorizar otro dispositivo.'
          : 'El enlace deja de funcionar para siempre y el dispositivo pierde el acceso.'}
        confirmLabel={confirm?.kind === 'reset' ? 'Restablecer' : 'Desactivar'}
        onConfirm={() => { action.mutate({ kind: confirm.kind, id: confirm.row.id }); setConfirm(null) }}
      />
    </Card>
  )
}

function NewLinkDialog({ terminals, token, onClose, onCreated }) {
  const [terminalId, setTerminalId] = useState(terminals[0]?.id ?? '')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  return (
    <FormDialog
      open
      onOpenChange={(v) => !v && onClose()}
      icon={Link2}
      title="Nuevo enlace de caja"
      description="Ábrelo en el dispositivo del mostrador; ahí aparecerá un código para que lo autorices."
      size="md"
      onSubmit={async () => {
        setSaving(true)
        try {
          const created = (await runly.pos.deviceLinks.create({ terminalId, ...(name.trim() ? { name: name.trim() } : {}) }, token)).data
          await navigator.clipboard?.writeText(linkUrl(created.linkToken)).catch(() => {})
          toast.success('Enlace creado y copiado')
          onCreated()
        } catch (e) {
          toast.error(e?.message ?? 'No se pudo crear el enlace.')
        } finally { setSaving(false) }
      }}
      footer={(
        <>
          <Button type="button" variant="outline" size="lg" onClick={onClose}>Cancelar</Button>
          <Button type="submit" size="lg" loading={saving} disabled={!terminalId}>Crear enlace</Button>
        </>
      )}
    >
      <SelectField label="Caja" value={terminalId} onChange={setTerminalId} options={terminals.map((t) => ({ value: t.id, label: t.name }))} />
      <TextField label="Nombre (opcional)" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ej. Tableta del mostrador" icon={null} />
    </FormDialog>
  )
}

function OperatorPins() {
  const { token, companyId } = useScope()
  const qc = useQueryClient()
  const pins = useQuery({ queryKey: ['pos-operator-pins', companyId, token], queryFn: () => runly.pos.operatorPins.list(token), enabled: Boolean(token && companyId) })
  const [editing, setEditing] = useState(null)
  const [removing, setRemoving] = useState(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['pos-operator-pins'] })
  const rows = pins.data?.data ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>PIN de cajeros</CardTitle>
        <CardDescription>Cada persona entra a una caja por enlace con su PIN de 4 a 6 dígitos. Lo que puede hacer depende de su rol en la empresa.</CardDescription>
      </CardHeader>
      <CardContent>
        {pins.isPending ? <Skeleton className="h-24" /> : pins.isError ? <ErrorState title="No se pudieron cargar los PIN" description={pins.error?.message} onRetry={pins.refetch} /> : (
          <ul className="divide-y divide-[hsl(var(--border))]">
            {rows.map((row) => (
              <li key={row.userId} className="flex items-center gap-3 py-3">
                <span className="min-w-0 flex-1 truncate font-medium text-[hsl(var(--foreground))]">{row.displayName}</span>
                {row.hasPin ? <StatusPill tone="success">Con PIN</StatusPill> : <StatusPill tone="neutral">Sin PIN</StatusPill>}
                <Button variant="outline" onClick={() => setEditing(row)}><KeyRound className="h-4 w-4" aria-hidden="true" />{row.hasPin ? 'Cambiar' : 'Asignar PIN'}</Button>
                {row.hasPin && <Button variant="ghost" onClick={() => setRemoving(row)}>Quitar</Button>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {editing && <PinDialog person={editing} token={token} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh() }} />}
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(v) => !v && setRemoving(null)}
        tone="destructive"
        icon={KeyRound}
        title="Quitar PIN"
        description={removing ? `${removing.displayName} ya no podrá entrar a las cajas por enlace.` : ''}
        confirmLabel="Quitar PIN"
        onConfirm={async () => {
          const person = removing
          setRemoving(null)
          try { await runly.pos.operatorPins.remove(person.userId, token); toast.success('PIN quitado'); refresh() } catch (e) { toast.error(e?.message ?? 'No se pudo quitar.') }
        }}
      />
    </Card>
  )
}

function PinDialog({ person, token, onClose, onSaved }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  return (
    <FormDialog
      open
      onOpenChange={(v) => !v && onClose()}
      icon={KeyRound}
      title={`PIN de ${person.displayName}`}
      description="De 4 a 6 dígitos y distinto al de las demás personas. Compártelo solo con esta persona."
      size="md"
      onSubmit={async () => {
        if (!/^\d{4,6}$/.test(pin)) { setError('El PIN debe tener de 4 a 6 dígitos.'); return }
        setSaving(true)
        try { await runly.pos.operatorPins.set(person.userId, pin, token); toast.success('PIN guardado'); onSaved() } catch (e) { setError(e?.message ?? 'No se pudo guardar.') } finally { setSaving(false) }
      }}
      footer={(
        <>
          <Button type="button" variant="outline" size="lg" onClick={onClose}>Cancelar</Button>
          <Button type="submit" size="lg" loading={saving}>Guardar PIN</Button>
        </>
      )}
    >
      <TextField label="PIN" type="password" autoComplete="new-password" inputMode="numeric" value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }} error={error} icon={null} />
    </FormDialog>
  )
}
