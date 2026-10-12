import { useEffect, useState } from 'react'
import { CreditCard, KeyRound, Smartphone, Trash2 } from 'lucide-react'
import { Badge, Button, ConfirmDialog, EmptyState, TextField } from '@runly/ui'
import { useAddCard, useEnrollInvite, useRevokeCredential } from '../hooks/useAttendanceData.js'
import { enrollLink, formatDateTime, fullName } from '../lib/attendanceLabels.js'
import { CopyButton, FormSheet, LinkBlock } from './shared.jsx'

const CREDENTIAL_LABELS = { card: 'Tarjeta', phone: 'Llave de teléfono', phone_key: 'Llave de teléfono', device_key: 'Llave de teléfono' }

// Per-person panel: assign a card, list/revoke credentials and invite a phone key.
export function PersonCredentialsSheet({ person, onClose, canManage }) {
  const open = Boolean(person)
  const addCard = useAddCard(), invite = useEnrollInvite(), revoke = useRevokeCredential()
  const [uid, setUid] = useState(''), [label, setLabel] = useState('')
  const [issued, setIssued] = useState(null)
  const [toRevoke, setToRevoke] = useState(null)
  useEffect(() => { setUid(''); setLabel(''); setIssued(null); setToRevoke(null) }, [person?.id])

  if (!person) return <FormSheet open={false} onOpenChange={onClose} title="" />
  const credentials = person.credentials ?? []
  const phoneKey = credentials.find((c) => c.type === 'device_key' && c.status === 'active')

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
        description={`Credenciales de ${person.code}. El PIN se edita desde la ficha de la persona.`}
        footer={<Button variant="outline" onClick={onClose}>Cerrar</Button>}
      >
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Credenciales activas</h3>
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
                <li>En el kiosko abre «Con mi teléfono» y escanea con la app.</li>
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
