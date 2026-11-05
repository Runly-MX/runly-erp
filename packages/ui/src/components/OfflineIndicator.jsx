// DEPRECATED: superseded by SyncStatusPopover. Kept only for the devkit export manifest; no app consumers.
import { WifiOff } from 'lucide-react'

export function OfflineIndicator({ pendingCount = 0, isOnline = true, onClick }) {
  if (isOnline) return null

  return (
    <button type="button"
      onClick={onClick}
      className="hidden md:flex items-center gap-1.5 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-2.5 py-1 text-xs text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--border))] transition-colors duration-150 cursor-pointer"
      title="Sin conexion — ver cambios pendientes"
    >
      <WifiOff size={12} className="shrink-0 text-amber-500 dark:text-amber-400" />
      <span>
        {pendingCount > 0
          ? `Sin conexion — ${pendingCount} ${pendingCount === 1 ? 'cambio pendiente' : 'cambios pendientes'}`
          : 'Sin conexion'}
      </span>
    </button>
  )
}
