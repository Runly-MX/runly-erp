import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button, ConfirmDialog, DataTable, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  ErrorState, NumberField, SearchInput, Skeleton, StatusPill, SwitchField,
} from '@runly/ui'
import { Info, LogOut, MoreHorizontal, Trash2, UserCheck, UserX, Users } from 'lucide-react'
import { toast } from 'sonner'
import { runly } from '../../../lib/runly.js'
import { useSessionPermission } from '../hooks/useWebsite.js'
import { SettingsCard } from './SettingsCard.jsx'

const DEFAULTS = { enabled: false, allowSignup: true, requireEmailVerification: true, sessionDays: 30 }
const formatDate = (value) => (value ? new Date(value).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : 'Nunca')

// "Cuentas de clientes": realm settings of the site plus the list of its customer accounts.
export function SettingsAccountsCard({ siteId, token }) {
  const queryClient = useQueryClient()
  // Aliased on the server: website.accounts.* falls back to website.site.read / website.site.update.
  const readPerm = useSessionPermission('website.accounts.read')
  const readAlias = useSessionPermission('website.site.read')
  const managePerm = useSessionPermission('website.accounts.manage')
  const manageAlias = useSessionPermission('website.site.update')
  const canRead = readPerm.allowed || readAlias.allowed
  const canManage = managePerm.allowed || manageAlias.allowed

  const [form, setForm] = useState(DEFAULTS)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search.trim())
  const [pending, setPending] = useState(null) // { kind: 'status' | 'revoke' | 'delete', account }

  const settingsQuery = useQuery({
    queryKey: ['website-account-settings', siteId],
    queryFn: () => runly.website.getAccountSettings(siteId, token),
    enabled: Boolean(token && siteId && canRead),
  })
  useEffect(() => { if (settingsQuery.data?.data) setForm(settingsQuery.data.data) }, [settingsQuery.data])

  const accountsQuery = useQuery({
    queryKey: ['website-accounts', siteId, deferredSearch],
    queryFn: () => runly.website.listAccounts(siteId, { search: deferredSearch, limit: 200 }, token),
    enabled: Boolean(token && siteId && canRead),
  })

  const saveMutation = useMutation({
    mutationFn: (data) => runly.website.updateAccountSettings(siteId, data, token),
    onSuccess: (res) => { setForm(res.data); queryClient.setQueryData(['website-account-settings', siteId], res); toast.success('Configuración de cuentas guardada') },
    onError: (err) => toast.error(err.message),
  })

  const actionMutation = useMutation({
    mutationFn: ({ kind, account }) => (kind === 'revoke'
      ? runly.website.revokeAccountSessions(siteId, account.id, token)
      : kind === 'delete'
        ? runly.website.deleteAccount(siteId, account.id, token)
        : runly.website.setAccountStatus(siteId, account.id, account.status === 'active' ? 'disabled' : 'active', token)),
    onSuccess: (_res, { kind, account }) => {
      toast.success(kind === 'revoke' ? 'Sesiones cerradas' : kind === 'delete' ? 'Cuenta eliminada' : account.status === 'active' ? 'Cuenta desactivada' : 'Cuenta reactivada')
      setPending(null)
      queryClient.invalidateQueries({ queryKey: ['website-accounts', siteId] })
    },
    onError: (err) => toast.error(err.message),
  })

  const columns = useMemo(() => [
    { id: 'email', header: 'Correo', accessorKey: 'email', cell: ({ row }) => <span className="font-medium">{row.original.email}</span> },
    { id: 'name', header: 'Nombre', accessorFn: (a) => a.displayName ?? '' },
    { id: 'verified', header: 'Verificado', accessorFn: (a) => (a.emailVerified ? 'Sí' : 'No'), cell: ({ row }) => (row.original.emailVerified ? <StatusPill tone="success" size="sm">Sí</StatusPill> : <StatusPill tone="neutral" size="sm">No</StatusPill>) },
    { id: 'lastLogin', header: 'Último acceso', accessorFn: (a) => a.lastLoginAt ?? '', cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{formatDate(row.original.lastLoginAt)}</span> },
    { id: 'status', header: 'Estado', accessorFn: (a) => a.status, cell: ({ row }) => (row.original.status === 'active' ? <StatusPill tone="success" size="sm">Activa</StatusPill> : <StatusPill tone="danger" size="sm">Desactivada</StatusPill>) },
    ...(canManage ? [{
      id: 'actions', header: '', enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="max-sm:h-11 max-sm:w-11" aria-label={`Acciones de ${row.original.email}`}><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setPending({ kind: 'status', account: row.original })}>
                {row.original.status === 'active' ? <><UserX className="mr-2 h-4 w-4" />Desactivar</> : <><UserCheck className="mr-2 h-4 w-4" />Reactivar</>}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setPending({ kind: 'revoke', account: row.original })}><LogOut className="mr-2 h-4 w-4" />Cerrar sesiones</DropdownMenuItem>
              <DropdownMenuItem className="text-[hsl(var(--destructive))]" onSelect={() => setPending({ kind: 'delete', account: row.original })}><Trash2 className="mr-2 h-4 w-4" />Eliminar cuenta</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    }] : []),
  ], [canManage])

  if (!canRead) {
    return <SettingsCard icon={Users} tone="amber" title="Cuentas de clientes" description="Tu rol no incluye permiso para ver las cuentas de clientes." />
  }

  const setField = (key) => (value) => setForm((current) => ({ ...current, [key]: value }))
  const days = Number(form.sessionDays)
  const daysValid = Number.isInteger(days) && days >= 1 && days <= 365
  const accounts = accountsQuery.data?.data ?? []
  const total = accountsQuery.data?.total ?? 0
  const disabling = pending?.kind === 'status' && pending.account.status === 'active'

  return (
    <SettingsCard
      icon={Users}
      tone="amber"
      title="Cuentas de clientes"
      description="Permite que los visitantes creen una cuenta e inicien sesión en este sitio."
      status={form.enabled ? <StatusPill tone="success" size="sm">Activas</StatusPill> : <StatusPill tone="neutral" size="sm">Desactivadas</StatusPill>}
    >
      <div className="space-y-6">
        {settingsQuery.isError ? (
          <ErrorState title="No se pudo cargar la configuración de cuentas" message={settingsQuery.error?.message} onRetry={() => settingsQuery.refetch()} />
        ) : settingsQuery.isPending ? (
          <div className="space-y-2"><Skeleton className="h-10 rounded-lg" /><Skeleton className="h-10 rounded-lg" /><Skeleton className="h-10 rounded-lg" /></div>
        ) : (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); saveMutation.mutate({ ...form, sessionDays: days }) }}>
            <p className="flex gap-2 text-xs text-[hsl(var(--muted-foreground))]">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Quienes se registran no son usuarios de Runly. Cada sitio tiene sus propias cuentas; el cliente queda vinculado a un contacto.
            </p>
            <SwitchField id="ws-acc-enabled" label="Activar cuentas de clientes" checked={form.enabled} disabled={!canManage} onChange={setField('enabled')} />
            <SwitchField id="ws-acc-signup" label="Permitir registro" description="Si lo desactivas, solo las cuentas existentes pueden iniciar sesión." checked={form.allowSignup} disabled={!canManage} onChange={setField('allowSignup')} />
            <SwitchField id="ws-acc-verify" label="Exigir verificación de correo" description="La cuenta debe confirmar su correo antes de iniciar sesión." checked={form.requireEmailVerification} disabled={!canManage} onChange={setField('requireEmailVerification')} />
            <div className="max-w-xs">
              <NumberField label="Duración de la sesión (días)" min={1} max={365} value={form.sessionDays} disabled={!canManage} error={daysValid ? undefined : 'Entre 1 y 365 días.'} onChange={(e) => setField('sessionDays')(e.target.value === '' ? '' : Number(e.target.value))} required />
            </div>
            {canManage && (
              <div className="flex justify-end border-t border-[hsl(var(--border))] pt-4">
                <Button type="submit" disabled={saveMutation.isPending || !daysValid} className="w-full sm:w-auto">{saveMutation.isPending ? 'Guardando...' : 'Guardar cuentas'}</Button>
              </div>
            )}
          </form>
        )}

        <div className="space-y-3 border-t border-[hsl(var(--border))] pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Cuentas registradas{total ? ` (${total})` : ''}</p>
            <SearchInput className="w-full sm:w-72" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por correo o nombre..." aria-label="Buscar cuentas" />
          </div>
          <DataTable
            columns={columns}
            data={accounts}
            getRowId={(a) => a.id}
            isLoading={accountsQuery.isPending}
            isError={accountsQuery.isError}
            onRetry={() => accountsQuery.refetch()}
            showToolbar={false}
            pageSize={10}
            stateKey={`website-accounts-${siteId}`}
            emptyIcon={Users}
            emptyTitle={deferredSearch ? 'Sin resultados' : 'Aún no hay cuentas'}
            emptyDescription={deferredSearch ? 'Ninguna cuenta coincide con la búsqueda.' : 'Las cuentas aparecerán aquí cuando los visitantes se registren en el sitio.'}
          />
          {total > accounts.length && <p className="text-xs text-[hsl(var(--muted-foreground))]">Mostrando las {accounts.length} más recientes de {total}. Usa la búsqueda para encontrar otras.</p>}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pending)}
        onOpenChange={(open) => { if (!open) setPending(null) }}
        title={pending?.kind === 'revoke' ? 'Cerrar sesiones' : pending?.kind === 'delete' ? 'Eliminar cuenta' : disabling ? 'Desactivar cuenta' : 'Reactivar cuenta'}
        description={pending?.kind === 'revoke'
          ? `Se cerrarán todas las sesiones abiertas de ${pending?.account.email}. Podrá volver a iniciar sesión.`
          : pending?.kind === 'delete'
            ? `Se borrarán para siempre la cuenta de ${pending?.account.email}, sus sesiones y sus archivos. El contacto vinculado se conserva. No se puede deshacer.`
            : disabling
            ? `${pending?.account.email} no podrá iniciar sesión y se cerrarán sus sesiones abiertas.`
            : `${pending?.account.email} podrá volver a iniciar sesión.`}
        confirmLabel={pending?.kind === 'revoke' ? 'Cerrar sesiones' : pending?.kind === 'delete' ? 'Eliminar' : disabling ? 'Desactivar' : 'Reactivar'}
        tone={pending?.kind === 'status' && !disabling ? 'primary' : 'destructive'}
        loading={actionMutation.isPending}
        onConfirm={() => actionMutation.mutate(pending)}
      />
    </SettingsCard>
  )
}
