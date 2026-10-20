import { useCallback, useEffect, useState } from 'react'
import { Button, ContactPicker, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, SelectField, SwitchField, TextField } from '@runly/ui'
import { Truck } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../../../auth/AuthProvider'
import { runly } from '../../../../lib/runly'
import { useInviteInventoryAreaGuest } from '../../hooks/useInventoryAreas.js'
import { GUEST_ROLE_OPTIONS } from '../../lib/guest-session.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Invites a supplier (no Runly account) to one folder by email. `onInvited` gets the API
// result ({ guest, link, code, sent, mailError }) so the caller can show the link.
export function GuestInviteDialog({ open, onOpenChange, area, onInvited }) {
  const { session } = useAuth()
  const token = session?.access_token
  const invite = useInviteInventoryAreaGuest(area?.id)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('viewer')
  const [contact, setContact] = useState(null)
  const [requireCode, setRequireCode] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setEmail(''); setName(''); setRole('viewer'); setContact(null); setRequireCode(false); setError('')
  }, [open])

  const searchContacts = useCallback(async (query) => {
    const response = await runly.contacts.picker(token, { q: query, limit: 10 })
    return response?.data ?? []
  }, [token])

  function pickContact(next) {
    setContact(next)
    if (!next) return
    if (next.email && !email) setEmail(next.email)
    if (next.name && !name) setName(next.name)
  }

  async function handleSend() {
    if (!EMAIL_RE.test(email.trim())) { setError('Ingresa un correo válido'); return }
    try {
      const result = await invite.mutateAsync({
        email: email.trim(), role, requireCode,
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(contact?.id ? { contactId: contact.id } : {}),
      })
      if (result?.sent === false) toast.warning('La invitación se creó, pero el correo no se pudo enviar')
      else toast.success('Invitación enviada')
      onOpenChange(false)
      onInvited(result)
    } catch (err) { setError(err?.message ?? 'No se pudo crear la invitación') }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="md">
        <DialogHeader icon={Truck}>
          <DialogTitle>Invitar proveedor</DialogTitle>
          <DialogDescription>
            Recibirá un enlace por correo para ver{role === 'editor' ? ' y editar' : ''} los items de {area?.name}, sin crear una cuenta.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-0.5">
          <ContactPicker label="Contacto (opcional)" value={contact} onChange={pickContact} searchContacts={searchContacts}
            placeholder="Buscar un proveedor registrado..." hint="Al elegirlo se completan el correo y el nombre." />
          <TextField label="Correo" type="email" required value={email} error={error}
            onChange={(e) => { setEmail(e.target.value); setError('') }} />
          <TextField label="Nombre" value={name} maxLength={150} onChange={(e) => setName(e.target.value)} />
          <SelectField label="Permisos" value={role} options={GUEST_ROLE_OPTIONS} onValueChange={setRole} />
          <SwitchField label="Requerir código de acceso" checked={requireCode} onChange={setRequireCode}
            description="Se genera un código que debes compartir por separado; el proveedor lo ingresa al abrir el enlace." />
        </div>
        <DialogFooter className="shrink-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" disabled={invite.isPending} onClick={handleSend}>{invite.isPending ? 'Enviando...' : 'Enviar invitación'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
