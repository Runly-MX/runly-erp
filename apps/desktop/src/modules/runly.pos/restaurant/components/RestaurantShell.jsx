import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Button, EmptyState, ErrorState, Skeleton, StatusPill } from '@runly/ui'
import { Lock, LogOut, Repeat, Settings2, Store, Wifi, WifiOff } from 'lucide-react'
import { useAuth } from '../../../../auth/AuthProvider.jsx'
import { useActiveCompany } from '../../../../company/ActiveCompanyProvider'
import PosContextGate from '../../retail/components/PosContextGate.jsx'
import PosNav from '../../components/PosNav.jsx'
import { useOnline } from '../../retail/components/PosOperationBar.jsx'
import { useRetailContext } from '../../retail/hooks/useRetailContext.js'
import { classifyPosError } from '../../retail/lib/retailErrors.js'

const ADMIN_PATH = '/app/m/runly.pos/pos/admin'

// Shared frame of the restaurant screens: outlet choice (explicit, only
// restaurant or mixed outlets), the C0 gates and the operation bar. The
// outlet selection is the same per-user/company one Tienda uses, so a mixed
// business keeps its place when switching between counter and tables.
export default function RestaurantShell({ title, requires, nav, children, actions }) {
  const { session: auth, userProfile } = useAuth()
  const token = auth?.access_token
  const { activeCompanyId } = useActiveCompany()
  const online = useOnline()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const ctx = useRetailContext({ token, companyId: activeCompanyId, userId: userProfile?.id })
  const context = ctx.context
  const caps = context?.capabilities ?? {}
  const outlet = context?.outlets?.find((o) => o.id === context?.selectedOutletId) ?? null
  const canAdmin = Boolean(userProfile?.isAdmin || userProfile?.permissions?.includes('pos.admin.read'))

  let body
  if (ctx.isPending && !context) {
    body = <div className="space-y-3 p-6" aria-label="Cargando"><Skeleton className="h-14" /><Skeleton className="h-96" /></div>
  } else if (ctx.error) {
    const info = classifyPosError(ctx.error)
    body = info.kind === 'forbidden'
      ? <EmptyState icon={Lock} title="No tienes acceso" description="Pide a un administrador el permiso para operar el restaurante." />
      : <ErrorState title="No se pudo cargar" description={info.message} onRetry={ctx.refetch} />
  } else if (!outlet || context.restaurantOperationState === 'SELECT_OUTLET' || context.restaurantOperationState === 'EXPERIENCE_NOT_AVAILABLE') {
    const restaurantOutlets = (context?.outlets ?? []).filter((o) => ['RESTAURANT', 'HYBRID'].includes(o.mode))
    body = (
      <div className="overflow-y-auto p-4 sm:p-6">
        {outlet && !caps.restaurant && (
          <EmptyState icon={Store} title={`${outlet.name} no tiene servicio de restaurante`} description="Elige otra sucursal o pide a un administrador que habilite la modalidad Restaurante o Mixta." action={{ label: 'Elegir otra sucursal', onClick: ctx.changeCaja }} />
        )}
        {!outlet && (
          <PosContextGate
            context={{ ...context, outlets: restaurantOutlets }}
            selection={{ outletId: null, terminalId: null }}
            notice={ctx.notice}
            onOutlet={(id) => ctx.chooseOutlet(id)}
            onTerminal={() => {}}
            canConfigure={canAdmin}
          />
        )}
      </div>
    )
  } else if (context.restaurantOperationState === 'CONFIGURATION_REQUIRED') {
    body = (
      <div className="p-6">
        <EmptyState icon={Settings2} title="Falta configurar el punto de venta" description="Un administrador debe definir la moneda e impuestos del punto de venta."
          action={canAdmin ? { label: 'Ir a Administración', onClick: () => navigate(ADMIN_PATH) } : undefined} />
      </div>
    )
  } else if (requires && !caps[requires]) {
    body = <div className="p-6"><EmptyState icon={Lock} title="Tu puesto no incluye esta pantalla" description="Pide a un administrador el permiso correspondiente." /></div>
  } else {
    body = children({ ctx, context, outlet, token, caps, userProfile, companyId: activeCompanyId, online, currency: context.currency ?? 'MXN' })
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[hsl(var(--background))]">
      <header className="flex min-h-14 flex-wrap items-center gap-x-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] pl-3 pr-2 sm:pl-4 sm:pr-3">
        <div className="min-w-0 py-2">
          <h1 className="truncate text-base font-bold text-[hsl(var(--foreground))]">{title}{outlet ? ` · ${outlet.name}` : ''}</h1>
          {userProfile?.displayName && <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{userProfile.displayName}</p>}
        </div>
        <PosNav exit className="order-last w-full self-end border-t border-[hsl(var(--border))] lg:order-none lg:ml-2 lg:w-auto lg:border-t-0" />
        {nav?.map((item) => (
          <Link key={item.to} to={item.to} className="inline-flex h-11 items-center rounded-md border border-[hsl(var(--border))] px-3 text-sm font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">{item.label}</Link>
        ))}
        <span className="flex-1" />
        {actions}
        {online
          ? <span className="hidden items-center gap-1.5 text-sm font-medium text-[hsl(var(--muted-foreground))] sm:inline-flex"><Wifi className="h-4 w-4" aria-hidden="true" />En línea</span>
          : <StatusPill tone="danger" icon={WifiOff}>Sin conexión</StatusPill>}
        <Button variant="ghost" size="icon" className="h-11 w-11 lg:hidden" onClick={() => navigate('/app/home')} aria-label="Salir del POS" title="Salir del POS">
          <LogOut className="h-5 w-5" aria-hidden="true" />
        </Button>
        {outlet && (
          <Button variant="outline" size="lg" className="h-11 gap-2" onClick={() => { ctx.changeCaja(); queryClient.invalidateQueries({ queryKey: ['pos-restaurant-tables'] }) }} aria-label="Cambiar de sucursal">
            <Repeat className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Sucursal</span>
          </Button>
        )}
      </header>
      {!online && context && (
        <p role="alert" className="border-b border-[hsl(var(--border))] bg-red-50 px-4 py-2 text-sm font-semibold text-red-900 dark:bg-red-950 dark:text-red-200">
          Sin conexión: no se envían comandas ni cobros hasta que vuelva. No hay ventas sin conexión.
        </p>
      )}
      <div className="flex min-h-0 flex-1 flex-col">{body}</div>
    </div>
  )
}
