import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FilePlus2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Button, TextField, ComboboxField, SwitchField,
} from '@runly/ui'
import { companyFetch } from '../../../lib/companyFetch.js'
import { getApiUrl } from '../../../lib/runtimeConfig.js'

const NEW_FORM_DEFAULTS = {
  name: '', description: '', submitLabel: 'Enviar', successMessage: '',
  notifyEmail: '', createsLead: true, defaultAssigneeUserId: '',
  honeypotEnabled: true, turnstileRequired: false, wizardMode: false,
}

export function FormsNewDialog({ open, onOpenChange, siteId, token, assignees, turnstileConfigured, onCreated }) {
  const queryClient = useQueryClient()
  const [data, setData] = useState(NEW_FORM_DEFAULTS)
  const set = (key, val) => setData((d) => ({ ...d, [key]: val }))

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await companyFetch(`${getApiUrl()}/website/forms`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data, siteId,
          description: data.description.trim() || undefined,
          successMessage: data.successMessage.trim() || undefined,
          notifyEmail: data.notifyEmail.trim() || null,
          defaultAssigneeUserId: data.defaultAssigneeUserId || null,
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
      return res.json()
    },
    onSuccess: (form) => {
      toast.success('Formulario creado')
      queryClient.invalidateQueries({ queryKey: ['website-forms', siteId] })
      setData(NEW_FORM_DEFAULTS)
      onCreated(form.id)
    },
    onError: (err) => toast.error(err.message || 'Error al crear formulario'),
  })

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) setData(NEW_FORM_DEFAULTS) }}>
      <DialogContent size="lg" scrollable>
        <DialogHeader icon={FilePlus2}>
          <DialogTitle>Nuevo formulario</DialogTitle>
          <DialogDescription>Después podrás agregar sus campos y copiar su ID para usarlo en tu sitio.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate() }} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Nombre" value={data.name} onChange={(e) => set('name', e.target.value)} placeholder="Formulario de contacto" required autoFocus />
              <TextField label="Botón de envío" value={data.submitLabel} onChange={(e) => set('submitLabel', e.target.value)} />
            </div>
            <TextField label="Descripción (opcional)" value={data.description} onChange={(e) => set('description', e.target.value)} />
            <TextField label="Mensaje de éxito (opcional)" value={data.successMessage} onChange={(e) => set('successMessage', e.target.value)} placeholder="Gracias, nos pondremos en contacto pronto." />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Notificar por email" type="email" value={data.notifyEmail} onChange={(e) => set('notifyEmail', e.target.value)} placeholder="tu@empresa.com" />
              <ComboboxField
                label="Responsable"
                options={[{ value: '', label: 'Sin responsable' }, ...assignees.map((a) => ({ value: a.id, label: a.displayName }))]}
                value={data.defaultAssigneeUserId}
                onChange={(v) => set('defaultAssigneeUserId', v)}
                placeholder="Seleccionar..."
                searchPlaceholder="Buscar..."
              />
            </div>
            <fieldset className="space-y-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-3">
              <legend className="flex items-center gap-1.5 px-1 text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden />Comportamiento y protección
              </legend>
              <SwitchField id="nf-lead" label="Crear lead automáticamente" description="Registra cada envío como lead en runly.growth" checked={data.createsLead} onChange={(v) => set('createsLead', v)} />
              <SwitchField id="nf-honeypot" label="Activar honeypot anti-spam" description="Campo oculto que atrapa bots" checked={data.honeypotEnabled} onChange={(v) => set('honeypotEnabled', v)} />
              <SwitchField
                id="nf-turnstile"
                label="Requerir Turnstile (CAPTCHA)"
                description={turnstileConfigured ? 'Anti-bot de Cloudflare' : 'Configura las claves en Ajustes primero'}
                checked={data.turnstileRequired}
                disabled={!turnstileConfigured}
                onChange={(v) => set('turnstileRequired', v)}
              />
              <SwitchField id="nf-wizard" label="Modo paso a paso (wizard)" description="Divide el formulario en pasos numerados. Configura el paso de cada campo después." checked={data.wizardMode} onChange={(v) => set('wizardMode', v)} />
            </fieldset>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending || !data.name.trim()}>
              {mutation.isPending ? 'Creando...' : 'Crear formulario'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
