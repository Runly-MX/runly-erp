import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { MessageSquare } from 'lucide-react'
import { Button, TextField } from '@runly/ui'
import { useAuth } from '../../../../auth/AuthProvider.jsx'
import { runly } from '../../../../lib/runly.js'

// Where pending approvals also appear as chat cards with Aprobar / Rechazar. Saved on its own
// (not part of the process form). Spec docs/superpowers/specs/2026-10-26-interactive-messages-design.md.
export function ApprovalChatPanel({ disabled }) {
  const token = useAuth().session?.access_token
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['purchases', 'approval-channel'], queryFn: () => runly.purchases.getApprovalChannel(token).then((res) => res?.data?.channel ?? ''), enabled: Boolean(token) })
  const [value, setValue] = useState('')
  useEffect(() => { if (typeof query.data === 'string') setValue(query.data) }, [query.data])
  const save = useMutation({
    mutationFn: (channel) => runly.purchases.setApprovalChannel(channel, token),
    onSuccess: (_, channel) => { queryClient.setQueryData(['purchases', 'approval-channel'], channel); toast.success(channel ? 'Las aprobaciones se publicarán en ese canal' : 'Aprobaciones en chat desactivadas') },
    onError: (error) => toast.error('No se pudo guardar', { description: error?.details?.error ?? error?.message }),
  })
  return (
    <section className="space-y-3 rounded-2xl border border-[hsl(var(--border))] p-4 md:p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold"><MessageSquare className="h-4 w-4" aria-hidden /> Aprobaciones en el chat</h2>
      <p className="text-sm text-[hsl(var(--muted-foreground))]">Cada aprobación pendiente aparece como una tarjeta con los botones Aprobar y Rechazar en este canal. Solo quien tiene el permiso de aprobar compras puede usarlos, y la tarjeta se cierra si la aprobación se decide en Compras. Déjalo vacío para no publicar.</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[14rem] flex-1"><TextField label="Canal de chat (nombre exacto)" value={value} maxLength={120} placeholder="aprobaciones" disabled={disabled} onChange={(e) => setValue(e.target.value)} /></div>
        {!disabled && <Button onClick={() => save.mutate(value.trim())} disabled={save.isPending || value.trim() === (query.data ?? '')}>Guardar</Button>}
      </div>
    </section>
  )
}
