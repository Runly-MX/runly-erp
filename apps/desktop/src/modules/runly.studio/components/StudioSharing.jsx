import { useState } from 'react'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, Input, SelectField, EmptyState, ErrorState } from '@runly/ui'
import { runly } from '../../../lib/runly.js'

export function StudioSharing({ record, token }) {
  const [open, setOpen] = useState(false), [rows, setRows] = useState([]), [people, setPeople] = useState([])
  const [q, setQ] = useState(''), [role, setRole] = useState('VIEWER'), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  async function load() {
    const result = await runly.studio.collaborators(record.id, token); setRows(result.data)
  }
  async function attempt(callback) {
    setError(''); setBusy(true)
    try { await callback() } catch (error) { setError(error.message) } finally { setBusy(false) }
  }
  async function grant(userId, role) { await runly.studio.share(record.id, { userId, role }, token); await load() }
  return <>
    <Button variant="outline" onClick={() => { setOpen(true); attempt(load) }}>Colaboradores</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Colaboradores del diseño</DialogTitle>
      <DialogDescription>Propietario: {record.ownerName ?? 'Tú'}. Los recursos privados se comparten solo dentro del diseño.</DialogDescription></DialogHeader>
      {error && <ErrorState description={error} showReport={false} />}
      {rows.length ? rows.map(user => <div key={user.id} className="flex flex-wrap items-center gap-2 border-b py-2">
        <span className="flex-1">{user.name} · {user.role === 'EDITOR' ? 'Editor' : 'Solo lectura'}</span>
        {record.role === 'OWNER' && <><Button size="sm" variant="outline" disabled={busy} onClick={() => attempt(() => grant(user.id, user.role === 'EDITOR' ? 'VIEWER' : 'EDITOR'))}>Cambiar permiso de {user.name}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => attempt(() => grant(user.id, null))}>Revocar acceso a {user.name}</Button></>}
      </div>) : <EmptyState title="Sin colaboradores" description="El propietario puede invitar miembros de esta empresa." />}
      {record.role === 'OWNER' && <div className="space-y-3">
        <Input aria-label="Buscar colaborador" value={q} onChange={event => setQ(event.target.value)} placeholder="Buscar integrante de la empresa" />
        <Button variant="outline" disabled={busy} onClick={() => attempt(async () => setPeople((await runly.studio.candidates(record.id, token, q)).data))}>Buscar integrantes</Button>
        <SelectField label="Permiso del colaborador" value={role} onChange={setRole} options={[{ value: 'VIEWER', label: 'Solo lectura' }, { value: 'EDITOR', label: 'Edición' }]} />
        {people.map(user => <Button key={user.id} variant="outline" disabled={busy} onClick={() => attempt(() => grant(user.id, role))}>Compartir con {user.name}</Button>)}
      </div>}
    </DialogContent></Dialog>
  </>
}
