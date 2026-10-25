import { useEffect, useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger, EmptyState, ErrorState, PersonAvatar, SearchInput, SegmentedControl } from '@runly/ui'
import { ChevronDown, Loader2, Share2, UserPlus, Users } from 'lucide-react'
import { runly } from '../../../lib/runly.js'

const ROLES = [{ value: 'EDITOR', label: 'Puede editar' }, { value: 'VIEWER', label: 'Solo lectura' }]
const roleLabel = role => ROLES.find(item => item.value === role)?.label ?? role

export function StudioSharing({ record, token, open, onOpenChange }) {
  const [rows, setRows] = useState([]), [people, setPeople] = useState([]), [loaded, setLoaded] = useState(false)
  const [q, setQ] = useState(''), [role, setRole] = useState('VIEWER'), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const owner = record.role === 'OWNER'
  async function attempt(callback) {
    setError(''); setBusy(true)
    try { await callback() } catch (error) { setError(error.message) } finally { setBusy(false) }
  }
  async function load() { setRows((await runly.studio.collaborators(record.id, token)).data); setLoaded(true) }
  async function grant(userId, nextRole) { await runly.studio.share(record.id, { userId, role: nextRole }, token); await load() }
  useEffect(() => { if (open) attempt(load) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open || !owner) return undefined
    const timer = setTimeout(() => attempt(async () => setPeople((await runly.studio.candidates(record.id, token, q)).data)), 300)
    return () => clearTimeout(timer)
  }, [open, owner, q]) // eslint-disable-line react-hooks/exhaustive-deps
  const shared = new Set(rows.map(user => user.id))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader icon={Share2}>
          <DialogTitle>Compartir diseño</DialogTitle>
          <DialogDescription>Propietario: {record.ownerName ?? 'Tú'}. Las imágenes privadas solo se comparten dentro de este diseño.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {error ? <ErrorState description={error} showReport={false} /> : null}
          {owner ? (
            <section aria-label="Invitar" className="space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Invitar a tu equipo</p>
              <SearchInput value={q} onChange={event => setQ(event.target.value)} onClear={() => setQ('')} placeholder="Buscar integrante de la empresa" aria-label="Buscar colaborador" />
              <SegmentedControl options={ROLES} value={role} onChange={setRole} ariaLabel="Permiso para nuevas invitaciones" />
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {people.filter(user => !shared.has(user.id)).map(user => (
                  <li key={user.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-[hsl(var(--muted))]">
                    <PersonAvatar name={user.name} src={user.avatarUrl ?? null} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm">{user.name}</span>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => attempt(() => grant(user.id, role))} aria-label={`Compartir con ${user.name}`}><UserPlus />Invitar</Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section aria-label="Personas con acceso" className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Personas con acceso</p>
            {!loaded ? <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--muted-foreground))] motion-reduce:animate-none" /></div>
              : rows.length ? (
                <ul className="space-y-1">
                  {rows.map(user => (
                    <li key={user.id} className="flex items-center gap-3 rounded-md px-2 py-1.5">
                      <PersonAvatar name={user.name} src={user.avatarUrl ?? null} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm">{user.name}</span>
                      {owner ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" disabled={busy} aria-label={`Permiso de ${user.name}`}>{roleLabel(user.role)}<ChevronDown /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-44">
                            <DropdownMenuRadioGroup value={user.role} onValueChange={value => attempt(() => grant(user.id, value))}>
                              {ROLES.map(option => <DropdownMenuRadioItem key={option.value} value={option.value}>{option.label}</DropdownMenuRadioItem>)}
                            </DropdownMenuRadioGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => attempt(() => grant(user.id, null))}>Quitar acceso</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : <span className="text-xs text-[hsl(var(--muted-foreground))]">{roleLabel(user.role)}</span>}
                    </li>
                  ))}
                </ul>
              ) : <EmptyState variant="compact" icon={Users} title="Solo tú tienes acceso" description={owner ? 'Busca a alguien de tu empresa para invitarle.' : 'El propietario puede invitar a más personas.'} />}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
