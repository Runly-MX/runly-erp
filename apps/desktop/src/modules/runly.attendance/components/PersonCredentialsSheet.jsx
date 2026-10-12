import { useEffect, useState } from 'react'
import { CreditCard, KeyRound, LockKeyhole, Smartphone, Trash2 } from 'lucide-react'
import { Badge, Button, ConfirmDialog, EmptyState, TextField } from '@runly/ui'
import { useAddCard, useEnrollInvite, useRevokeCredential, useSavePerson } from '../hooks/useAttendanceData.js'
import { enrollLink, formatDateTime, fullName } from '../lib/attendanceLabels.js'
import { PinField } from './fields/PinField.jsx'
import { CopyButton, FormSheet, LinkBlock } from './shared.jsx'

const CREDENTIAL_LABELS = { card: 'Tarjeta', phone: 'Llave de teléfono', phone_key: 'Llave de teléfono', device_key: 'Llave de teléfono' }

// Per-person panel: assign a card, list/revoke credentials and invite a phone key.
export function PersonCredentialsSheet({ person, onClose, canManage }) {
  const open = Boolean(person)
  const addCard = useAddCard(), invite = useEnrollInvite(), revoke = useRevokeCredential(), savePerson = useSavePerson()
  const [pin, setPin] = useState(''), [pinError, setPinError] = useState(''), [issuedPin, setIssuedPin] = useState(null), [removingPin, setRemovingPin] = useState(false)
  const [uid, setUid] = useState(''), [label, setLabel] = useState('')
  const [issued, setIssued] = useState(null)
  const [toRevoke, setToRevoke] = useState(null)
  useEffect(() => { setUid(''); setLabel(''); setIssued(null); setToRevoke(null); setPin(''); setPinError(''); setIssuedPin(null); setRemovingPin(false) }, [person?.id])

  if (!person) return <FormSheet open={false} onOpenChange={onClose} title="" />
  const credentials = person.credentials ?? []
  const phoneKey = credentials.find((c) => c.type === 'device_key' && c.status === 'active')

  async function savePin() {
    if (!/^\d{4,8}$/.test(pin)) { setPinError('El PIN debe tener de 4 a 8 dígitos.'); return }
    setPinError('')
    try { await savePerson.mutateAsync({ id: person.id, pin }); setIssuedPin(pin); setPin('') } catch { /* toast */ }
  }
  async function removePin() {
    try { await savePerson.mutateAsync({ id: person.id, pin: null }); setIssuedPin(null); setRemovingPin(false) } catch { /* toast */ }
  }
  async function assignCard() {
    if (uid.trim().length < 4) return
    try { await addCard.mutateAsync({ personId: person.id, uid: uid.trim(), label: label.trim() || null }); setUid(''); setLabel('') } catch { /* toast */ }
  }
  async function createInvite() {
    try { setIssued(await invite.mutateAsync(person.id)) } catch { /* toast */ }
  }

  return (
    <>
      <FormSheet
        open={open}
        onOpenChange={(next) => !next && onClose()}
        title={fullName(person)}
        description={`Acceso de ${person.code}: PIN, tarjeta y llave de teléfono.`}
        footer={<Button variant="outline" onClick={onClose}>Cerrar</Button>}
      >
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">PIN</h3>
            <Badge variant={person.hasPin ? 'success' : 'secondary'}>{person.hasPin ? 'Tiene PIN' : 'Sin PIN'}</Badge>
          </div>
          {canManage ? (
            <>
              <PinField
                value={pin} onChange={(v) => { setPin(v); setPinError('') }} error={pinError}
                label={person.hasPin ? 'Nuevo PIN (4 a 8 dígitos)' : 'PIN (4 a 8 dígitos)'}
                hint="Con el código de empleado y este PIN la persona checa en el kiosko. Se guarda cifrado: no se puede volver a ver."
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={savePin} disabled={!pin || savePerson.isPending}><LockKeyhole className="h-4 w-4" />{person.hasPin ? 'Cambiar PIN' : 'Guardar PIN'}</Button>
                {person.hasPin ? <Button variant="outline" onClick={() => setRemovingPin(true)} disabled={savePerson.isPending}><Trash2 className="h-4 w-4" />Quitar PIN</Button> : null}
              </div>
              {issuedPin ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-teal-600/30 bg-teal-600/5 p-3">
                  <div>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">PIN guardado. Compártelo ahora; no se vuelve a mostrar.</p>
                    <p className="font-mono text-xl font-bold tracking-widest">{issuedPin}</p>
                  </div>
                  <CopyButton value={issuedPin} label="Copiar PIN" />
                </div>
              ) : null}
            </>
          ) : null}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Tarjetas y llaves de teléfono</h3>
          {credentials.length === 0 ? (
            <EmptyState variant="compact" icon={KeyRound} title="Sin tarjetas ni llaves de teléfono." />
          ) : credentials.map((cred) => (
            <div key={cred.id} className="flex items-center justify-between gap-2 rounded-xl border border-[hsl(var(--border))] p-3">
              <div className="flex min-w-0 items-center gap-3">
                {cred.type === 'card' ? <CreditCard className="h-4 w-4 shrink-0 text-teal-600" /> : <Smartphone className="h-4 w-4 shrink-0 text-teal-600" />}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{CREDENTIAL_LABELS[cred.type] ?? cred.type}{cred.label ? ` · ${cred.label}` : ''}</p>
                  <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">
                    {cred.uid ? `${cred.uid} · ` : ''}Último uso: {formatDateTime(cred.lastUsedAt)}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {cred.status !== 'active' ? <Badge variant="warning">{cred.status}</Badge> : null}
                {canManage ? <Button variant="ghost" size="sm" aria-label="Revocar credencial" onClick={() => setToRevoke(cred)}><Trash2 className="h-4 w-4" /></Button> : null}
              </div>
            </div>
          ))}
        </section>

        {canManage ? (
          <>
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Asignar tarjeta</h3>
              <TextField label="UID de la tarjeta" value={uid} onChange={(e) => setUid(e.target.value)} placeholder="Acerca la tarjeta al lector o escribe el UID" hint="Mínimo 4 caracteres." />
              <TextField label="Etiqueta (opcional)" value={label} onChange={(e) => setLabel(e.target.value)} />
              <Button onClick={assignCard} disabled={uid.trim().length < 4 || addCard.isPending}>{addCard.isPending ? 'Asignando…' : 'Asignar tarjeta'}</Button>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Llave de teléfono</h3>
              {phoneKey ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-teal-600/30 bg-teal-600/5 p-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Smartphone className="h-4 w-4 shrink-0 text-teal-600" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Teléfono enrolado</p>
                      <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{phoneKey.label ? `${phoneKey.label} · ` : ''}Último uso: {formatDateTime(phoneKey.lastUsedAt)}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setToRevoke(phoneKey)}>Revocar</Button>
                </div>
              ) : null}
              <ol className="list-decimal space-y-1 pl-5 text-sm text-[hsl(var(--muted-foreground))]">
                <li>Comparte el enlace o el QR de la invitación con la persona.</li>
                <li>La persona lo abre en su teléfono, escribe su código de empleado y toca Instalar.</li>
                <li>En el kiosko abre «Mi teléfono» y escanea con la app.</li>
              </ol>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                La invitación dura 48 horas y reemplaza la anterior.
                {person.enrollPending ? ' Ya hay una invitación pendiente; generar otra la reemplaza.' : ''}
              </p>
              <Button variant="outline" onClick={createInvite} disabled={invite.isPending}><Smartphone className="h-4 w-4" />{invite.isPending ? 'Generando…' : phoneKey ? 'Invitar otro teléfono' : 'Invitar llave de teléfono'}</Button>
              {issued ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-teal-600/30 bg-teal-600/5 p-3">
                    <div>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">Código de invitación</p>
                      <p className="font-mono text-xl font-bold tracking-widest">{issued.code}</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">Vence: {formatDateTime(issued.expiresAt)}</p>
                    </div>
                    <CopyButton value={issued.code} label="Copiar código" />
                  </div>
                  <LinkBlock label="Enlace de registro" value={enrollLink(window.location.origin, issued.code)} />
                </div>
              ) : null}
            </section>
          </>
        ) : null}
      </FormSheet>

      <ConfirmDialog
        open={removingPin}
        onOpenChange={(next) => !next && setRemovingPin(false)}
        title="Quitar PIN"
        description="La persona ya no podrá checar con código y PIN. Podrá seguir usando su tarjeta o su teléfono."
        detail={fullName(person)}
        confirmLabel="Quitar PIN"
        loading={savePerson.isPending}
        onConfirm={removePin}
      />
      <ConfirmDialog
        open={Boolean(toRevoke)}
        onOpenChange={(next) => !next && setToRevoke(null)}
        title="Revocar credencial"
        description="La credencial dejará de funcionar de inmediato. Esta acción no se puede deshacer."
        detail={toRevoke ? (toRevoke.uid || CREDENTIAL_LABELS[toRevoke.type] || toRevoke.type) : undefined}
        confirmLabel="Revocar"
        loading={revoke.isPending}
        onConfirm={async () => { try { await revoke.mutateAsync(toRevoke.id); setToRevoke(null) } catch { /* toast */ } }}
      />
    </>
  )
}
