import { Link, NavLink } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { cn } from '@runly/ui'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { usePosNavModes } from '../hooks/usePosNavModes.js'

const BASE = '/app/m/runly.pos/pos'
const ITEMS = [
  { to: `${BASE}/caja`, label: 'Caja', any: ['pos.caja.read', 'pos.caja.operate'] },
  { to: `${BASE}/citas`, label: 'Citas', any: ['pos.caja.read', 'pos.comandas.read'], appointments: true },
  { to: `${BASE}/comandero`, label: 'Comandero', any: ['pos.comandas.read'], restaurant: true },
  { to: `${BASE}/cocina`, label: 'Cocina', any: ['pos.cocina.read', 'pos.stations.read'], restaurant: true },
  { to: `${BASE}/orders`, label: 'Órdenes', any: ['pos.orders.read'] },
  { to: `${BASE}/admin`, label: 'Administración', any: ['pos.admin.read'] },
]

// POS's own navigation for its full-screen operating screens (the ERP side
// menu is hidden there). Restaurant entries only when an outlet serves tables,
// Citas only when appointments are on, every entry gated by permission.
// exit: the operating screens hide the ERP top bar, so the nav carries the way out.
export default function PosNav({ className, exit = false }) {
  const { session, userProfile } = useAuth()
  const { activeCompanyId } = useActiveCompany()
  const nav = usePosNavModes({ enabled: true, token: session?.access_token, companyId: activeCompanyId })
  const restaurant = !nav.modes?.length || nav.modes.some((m) => ['RESTAURANT', 'HYBRID'].includes(m))
  const allowed = (keys) => Boolean(userProfile?.isAdmin) || keys.some((k) => userProfile?.permissions?.includes(k))
  const items = ITEMS.filter((i) => allowed(i.any) && (!i.restaurant || restaurant) && (!i.appointments || nav.appointments))
  if (items.length < 2 && !exit) return null
  return (
    <nav aria-label="Punto de venta" className={cn('-mb-px flex min-w-0 items-stretch overflow-x-auto', className)}>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => cn(
            'inline-flex h-11 shrink-0 items-center border-b-2 px-3 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))]',
            isActive ? 'border-(--brand-primary) text-[hsl(var(--foreground))]' : 'border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
          )}
        >
          {item.label}
        </NavLink>
      ))}
      {exit && (
        <Link to="/app/home" className="ml-auto inline-flex h-11 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 text-sm font-semibold whitespace-nowrap text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))]">
          <LogOut className="h-4 w-4" aria-hidden="true" />Salir del POS
        </Link>
      )}
    </nav>
  )
}
