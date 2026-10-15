import { useEffect, useState } from 'react'
import {
  Button, ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, ErrorState, Skeleton, SwitchField,
} from '@runly/ui'
import { Globe, Unlink } from 'lucide-react'
import { toast } from 'sonner'
import { usePublicPageSettings, useRevokeAllPublicLinks, useSavePublicPageSettings } from '../../hooks/useInventoryLabels.js'

const FIELDS = [
  { key: 'showPhoto', label: 'Foto', hint: 'Imagen de portada del equipo.' },
  { key: 'showStatus', label: 'Estado y disponibilidad', hint: 'Alta o baja, y si está disponible o asignado.' },
  { key: 'showLocation', label: 'Ubicación', hint: 'Dónde se encuentra el equipo.' },
  { key: 'showSerial', label: 'Número de serie', hint: 'Oculto por defecto.' },
  { key: 'showHolder', label: 'Responsable asignado', hint: 'Persona que tiene el equipo. Oculto por defecto.' },
  { key: 'showCosts', label: 'Costo de compra', hint: 'Oculto por defecto.' },
]

// Company setting for the anonymous page opened from the QR (always shows
// name, folio and company; permission inventory.label.manage).
export function PublicPageSettingsDialog({ open, onOpenChange }) {
  const query = usePublicPageSettings({ enabled: open })
  const save = useSavePublicPageSettings()
  const revokeAll = useRevokeAllPublicLinks()
  const [draft, setDraft] = useState(null)
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false)

  useEffect(() => { if (open && query.data) setDraft(query.data) }, [open, query.data])

  const dirty = Boolean(draft && query.data && FIELDS.some(({ key }) => draft[key] !== query.data[key]))

  async function onSave() {
    try {
      await save.mutateAsync(draft)
      toast.success('Página pública actualizada')
      onOpenChange(false)
    } catch (err) {
      toast.error(err?.message ?? 'No se pudo guardar la configuración')
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent scrollable size="md">
          <DialogHeader icon={Globe}>
            <DialogTitle>Página pública del equipo</DialogTitle>
            <DialogDescription>Qué ve quien escanea el código QR sin iniciar sesión. El nombre, el folio y la empresa siempre se muestran.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-0.5">
            {query.isLoading || (query.data && !draft) ? (
              <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
            ) : query.error ? (
              <ErrorState title="No se pudo cargar la configuración" description={query.error.message} onRetry={() => query.refetch()} />
            ) : (
              <div className="space-y-3">
                {FIELDS.map(({ key, label, hint }) => (
                  <SwitchField key={key} id={`public-${key}`} label={label} description={hint}
                    checked={Boolean(draft?.[key])} onChange={(value) => setDraft((prev) => ({ ...prev, [key]: typeof value === 'boolean' ? value : Boolean(value?.target?.checked) }))} />
                ))}
              </div>
            )}
            <div className="flex items-start justify-between gap-3 rounded-md border border-[hsl(var(--border))] px-3 py-2">
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Revoca todos los enlaces públicos de la empresa. Todas las etiquetas impresas dejarán de abrir la página y deberán reimprimirse.</p>
              <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setConfirmRevokeAll(true)}>
                <Unlink className="mr-1.5 h-3.5 w-3.5" />Revocar todos
              </Button>
            </div>
          </div>
          <DialogFooter className="shrink-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="button" onClick={onSave} disabled={!dirty || save.isPending}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmRevokeAll}
        onOpenChange={setConfirmRevokeAll}
        title="Revocar todos los enlaces"
        description="Los códigos QR de todas las etiquetas impresas dejarán de funcionar. Se generarán enlaces nuevos al volver a imprimir."
        confirmLabel="Revocar todos"
        loading={revokeAll.isPending}
        onConfirm={async () => {
          try {
            const result = await revokeAll.mutateAsync()
            toast.success(`${result?.revoked ?? 0} enlaces revocados`)
          } catch (err) {
            toast.error(err?.message ?? 'No se pudieron revocar los enlaces')
          }
          setConfirmRevokeAll(false)
        }}
      />
    </>
  )
}
