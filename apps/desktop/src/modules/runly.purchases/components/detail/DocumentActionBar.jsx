import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ActionMenu, Button } from '@runly/ui'
import { errorText, policyReasons, useDecideApproval, useTransition } from '../../hooks/usePurchases.js'
import { ROOT } from '../../lib/purchases-constants.js'
import { TransitionConfirmDialog } from './TransitionConfirmDialog.jsx'

const DONE = {
  submit: 'Documento enviado', approve: 'Aprobado', reject: 'Rechazado', issue: 'Orden emitida', close: 'Cerrado',
  cancel: 'Cancelado', reopen: 'Reabierto', convert: 'Orden creada desde la solicitud',
}

// Runs the actions from lib/document-actions.js. One runner per screen, shared
// by the header bar and the "Siguiente paso" panel, so both trigger exactly
// the same request (with the version on screen) and share one confirm dialog.
//   { trigger(action), busy, confirmDialog }
export function useActionRunner(kind, doc, onDialog) {
  const navigate = useNavigate()
  const transition = useTransition(kind, doc?.id)
  const decide = useDecideApproval()
  const [pending, setPending] = useState(null)
  const busy = transition.isPending || decide.isPending

  const run = async (action, payload = {}) => {
    if (action.via === 'approval') {
      const approval = (doc.approvals ?? []).find((a) => a.status === 'PENDING')
      if (!approval) { toast.error('Este documento ya no tiene una aprobación pendiente.'); setPending(null); return }
      // useDecideApproval toasts the outcome itself.
      await decide.mutateAsync({ id: approval.id, decision: action.action === 'approve' ? 'APPROVED' : 'REJECTED', comment: payload.comment }).then(() => setPending(null), () => {})
      return
    }
    try {
      // The version on screen: a document changed by someone else answers 409 STALE_DOCUMENT.
      const result = await transition.mutateAsync({ action: action.action, expectedUpdatedAt: doc.updatedAt, ...payload })
      toast.success(DONE[action.action] ?? 'Listo')
      setPending(null)
      if (action.opensResult && result?.id) navigate(`${ROOT}/${action.opensResult}/${result.id}`)
    } catch (error) {
      const reasons = policyReasons(error)
      toast.error(reasons.length ? `Bloqueado por política: ${reasons.map((r) => r.reason ?? r).join('; ')}` : errorText(error, 'No se pudo completar la acción'))
    }
  }

  const trigger = (action) => {
    if (!action || action.disabled) return undefined
    if (action.type === 'edit') return navigate(`${ROOT}/${kind}/${doc.id}/edit`)
    if (action.type === 'navigate') return navigate(`${ROOT}/${action.to}`)
    if (action.type === 'dialog') return onDialog(action.dialog)
    if (action.confirm) return setPending(action)
    return run(action)
  }

  const confirmDialog = (
    <TransitionConfirmDialog action={pending} open={Boolean(pending)} onOpenChange={(o) => { if (!o) setPending(null) }}
      loading={busy} onConfirm={(payload) => run(pending, payload)} />
  )
  return { trigger, busy, confirmDialog }
}

// Page-header actions: the first primary as a solid button, one more visible,
// the rest in a menu. Phones: one full-width action and the rest in the menu.
export function DocumentActionBar({ actions, runner, phone = false }) {
  if (!actions.length) return null
  const visible = actions.filter((a) => a.tone !== 'danger').slice(0, phone ? 1 : 2)
  const rest = actions.filter((a) => !visible.includes(a))

  return (
    <>
      {visible.map((action, index) => (
        <Button key={action.key} size={phone ? 'default' : 'sm'} variant={index === 0 ? 'default' : 'outline'} disabled={runner.busy || action.disabled}
          title={action.disabledReason} className={phone ? 'h-11 flex-1' : undefined} onClick={() => runner.trigger(action)}>
          {action.label}
        </Button>
      ))}
      {rest.length ? (
        <ActionMenu label="Más acciones" triggerVariant={phone ? 'outline' : 'ghost'} triggerClassName={phone ? 'h-11 w-11 shrink-0' : undefined}
          items={rest.map((a) => ({ label: a.label, onClick: () => runner.trigger(a), disabled: a.disabled, variant: a.tone === 'danger' ? 'destructive' : undefined }))} />
      ) : null}
    </>
  )
}
