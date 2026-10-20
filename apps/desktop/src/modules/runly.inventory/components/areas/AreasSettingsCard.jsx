import { useState } from 'react'
import { Card, ConfirmDialog, Switch } from '@runly/ui'
import { ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { useInventoryAreasSettings, useSetInventoryAreasSettings } from '../../hooks/useInventoryAreas.js'

// Per-company switch that turns area scoping on or off. Enabling asks first because users without
// "Ver todos los inventarios" lose sight of everything outside their areas.
export function AreasSettingsCard() {
  const settings = useInventoryAreasSettings()
  const save = useSetInventoryAreasSettings()
  const [confirmEnable, setConfirmEnable] = useState(false)
  const [affectedRoles, setAffectedRoles] = useState([])
  const enabled = Boolean(settings.data?.enabled)
  // Defaults to true when the company never set it.
  const includeOwn = settings.data?.includeOwn !== false

  async function applyIncludeOwn(next) {
    try {
      await save.mutateAsync({ includeOwn: next })
      toast.success(next ? 'Los usuarios verán también sus propios items' : 'Los usuarios solo verán los items de sus áreas')
    } catch {
      // The mutation already reported the error.
    }
  }

  async function apply(next) {
    try {
      const result = await save.mutateAsync(next)
      setAffectedRoles(next ? (result?.affectedRoles ?? []) : [])
      toast.success(next ? 'Segmentación por áreas activada' : 'Segmentación por áreas desactivada')
    } catch {
      // The mutation already reported the error.
    }
    setConfirmEnable(false)
  }

  return (
    <Card className="p-4 md:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold">Segmentar inventario por áreas</p>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            {enabled
              ? 'Activa. Los usuarios sin el permiso «Ver todos los inventarios» solo ven las áreas donde son miembros.'
              : 'Desactivada. Todos los usuarios con acceso al inventario ven todos los items; las áreas solo sirven para organizar.'}
          </p>
        </div>
        <Switch
          aria-label="Segmentar inventario por áreas"
          checked={enabled}
          disabled={settings.isLoading || save.isPending}
          onCheckedChange={(next) => (next ? setConfirmEnable(true) : apply(false))}
        />
      </div>
      {enabled ? (
        <div className="mt-4 flex items-start justify-between gap-4 border-t border-[hsl(var(--border))] pt-4">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold">Incluir mis propios items</p>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {includeOwn
                ? 'Además de sus áreas, cada usuario ve (solo lectura) los items que registró o que tiene asignados.'
                : 'Cada usuario ve únicamente los items de sus áreas.'}
            </p>
          </div>
          <Switch
            aria-label="Incluir mis propios items"
            checked={includeOwn}
            disabled={settings.isLoading || save.isPending}
            onCheckedChange={applyIncludeOwn}
          />
        </div>
      ) : null}
      {enabled && affectedRoles.length > 0 ? (
        <div className="mt-4 flex items-start gap-3 rounded-md bg-amber-500/10 p-3 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p>
            Estos roles ahora solo ven sus áreas: <span className="font-medium">{affectedRoles.map((r) => r.name).join(', ')}</span>.
            Dales el permiso «Ver todos los inventarios» si deben seguir viendo todo.
          </p>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmEnable}
        onOpenChange={setConfirmEnable}
        icon={ShieldAlert}
        tone="warning"
        size="md"
        title="Activar segmentación por áreas"
        description="Los usuarios sin el permiso «Ver todos los inventarios» solo verán las áreas donde sean miembros. Los items sin área (General) quedarán ocultos para ellos."
        confirmLabel="Activar"
        loading={save.isPending}
        onConfirm={() => apply(true)}
      />
    </Card>
  )
}
