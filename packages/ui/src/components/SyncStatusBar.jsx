// DEPRECATED: superseded by SyncStatusPopover. Kept only for the devkit export manifest; no app consumers.
import { RefreshCw, CheckCircle, WifiOff } from 'lucide-react'
import { useState, useEffect } from 'react'

function formatRelativeTime(isoString) {
  if (!isoString) return null
  const diffMs = Date.now() - new Date(isoString).getTime()
  if (diffMs < 3_600_000) return `hace ${Math.floor(diffMs / 60_000)} min`
  return `hace ${Math.floor(diffMs / 3_600_000)} h`
}

export function SyncStatusBar({ isOnline = true, isSyncing = false, lastSyncAt = null, onSyncNow }) {
  const [showLabel, setShowLabel] = useState(false)

  useEffect(() => {
    if (!lastSyncAt) return
    setShowLabel(true)
    const t = setTimeout(() => setShowLabel(false), 6_000)
    return () => clearTimeout(t)
  }, [lastSyncAt])

  if (!lastSyncAt && !isSyncing) return null

  const relTime = formatRelativeTime(lastSyncAt)
  const label = isSyncing ? 'Sincronizando...' : relTime ? `Sync ${relTime}` : null

  return (
    <div className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
      <div className="h-9 w-9 flex items-center justify-center shrink-0">
        {isSyncing && (
          <RefreshCw
            size={16}
            className="animate-spin text-[var(--brand-primary)]"
            aria-label="Sincronizando"
          />
        )}
        {!isSyncing && isOnline && (
          <CheckCircle
            size={16}
            className="text-green-500 dark:text-green-400"
            aria-label="Sincronizado"
          />
        )}
        {!isSyncing && !isOnline && (
          <WifiOff
            size={16}
            className="text-amber-500 dark:text-amber-400"
            aria-label="Sin conexion"
          />
        )}
      </div>
      {(isSyncing || showLabel) && label && (
        <span className="hidden md:inline">{label}</span>
      )}
      {onSyncNow && isOnline && !isSyncing && (
        <button
          onClick={onSyncNow}
          className="hidden md:inline underline decoration-dotted hover:text-[hsl(var(--foreground))] transition-colors"
          type="button"
        >
          Actualizar
        </button>
      )}
    </div>
  )
}
