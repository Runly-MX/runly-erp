// apps/desktop/src/modules/runly.pos/retail/components/PosOperationBar.jsx
import { useEffect, useState } from 'react'
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, StatusPill } from '@runly/ui'
import { ArrowDownToLine, ArrowUpFromLine, CircleCheck, CircleSlash, LockKeyhole, Menu, Receipt, Repeat, Wifi, WifiOff } from 'lucide-react'

export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

function openedAt(session) {
  try { return new Date(session.openedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}

// Operation surface header: where I am (outlet · register), register state,
// operator and connection. Register operations live in one menu.
export default function PosOperationBar({ outletName, terminalName, session, cashier, online, capabilities, onCashIn, onCashOut, onClose, onOrders, onChangeCaja, saleInProgress }) {
  return (
    <header className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 sm:px-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-[hsl(var(--foreground))] sm:text-base">{outletName} · {terminalName}</p>
        {cashier && <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">Cajero: {cashier}</p>}
      </div>
      {session
        ? <StatusPill tone="success" icon={CircleCheck}>Caja abierta {openedAt(session)}</StatusPill>
        : <StatusPill tone="neutral" icon={LockKeyhole}>Caja cerrada</StatusPill>}
      <span className="flex-1" />
      {online
        ? <span className="hidden items-center gap-1.5 text-sm font-medium text-[hsl(var(--muted-foreground))] sm:inline-flex"><Wifi className="h-4 w-4" aria-hidden="true" />En línea</span>
        : <StatusPill tone="danger" icon={WifiOff}>Sin conexión</StatusPill>}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="lg" className="h-11 gap-2" aria-label="Operaciones de caja">
            <Menu className="h-5 w-5" aria-hidden="true" /><span className="hidden sm:inline">Caja</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem onSelect={onOrders} className="min-h-11"><Receipt className="mr-2 h-4 w-4" aria-hidden="true" />Órdenes y devoluciones</DropdownMenuItem>
          {session && capabilities?.openSession && (
            <>
              <DropdownMenuItem onSelect={onCashIn} className="min-h-11"><ArrowDownToLine className="mr-2 h-4 w-4" aria-hidden="true" />Entrada de efectivo</DropdownMenuItem>
              <DropdownMenuItem onSelect={onCashOut} className="min-h-11"><ArrowUpFromLine className="mr-2 h-4 w-4" aria-hidden="true" />Salida de efectivo</DropdownMenuItem>
            </>
          )}
          {session && capabilities?.closeSession && (
            <DropdownMenuItem onSelect={onClose} disabled={saleInProgress} className="min-h-11">
              <LockKeyhole className="mr-2 h-4 w-4" aria-hidden="true" />{saleInProgress ? 'Cerrar caja (termina la venta)' : 'Cerrar caja'}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onChangeCaja} disabled={saleInProgress} className="min-h-11">
            {saleInProgress ? <CircleSlash className="mr-2 h-4 w-4" aria-hidden="true" /> : <Repeat className="mr-2 h-4 w-4" aria-hidden="true" />}Cambiar de caja
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
