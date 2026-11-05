// apps/desktop/src/modules/runly.pos/retail/components/PosOperationBar.jsx
import { useEffect, useState } from 'react'
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, StatusPill } from '@runly/ui'
import { ArrowDownToLine, ArrowUpFromLine, CircleCheck, CircleSlash, LockKeyhole, LogOut, Menu, Receipt, Repeat, Store, Wifi, WifiOff } from 'lucide-react'
import PosNav from '../../components/PosNav.jsx'

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
// operator and connection; the POS navigation (full-screen screens have no ERP
// side menu); register operations in one "Más" menu.
export default function PosOperationBar({ outletName, terminalName, session, cashier, online, capabilities, onCashIn, onCashOut, onClose, onOrders, onChangeCaja, onSignOut, saleInProgress, nav = false, modeSwitch = null, onExit }) {
  return (
    <header className="flex min-h-14 flex-wrap items-center gap-x-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] pl-3 pr-2 sm:pl-4 sm:pr-3">
      <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md bg-(--pos-band) text-(--pos-band-accent) sm:flex"><Store className="h-5 w-5" aria-hidden="true" /></span>
      <div className="min-w-0 py-2">
        <p className="truncate text-sm font-bold text-[hsl(var(--foreground))]">{outletName} · {terminalName}</p>
        {cashier && <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">Atiende {cashier}</p>}
      </div>
      <span className="hidden sm:contents">
        {session
          ? <StatusPill tone="success" icon={CircleCheck}>Abierta {openedAt(session)}</StatusPill>
          : <StatusPill tone="neutral" icon={LockKeyhole}>Caja cerrada</StatusPill>}
      </span>
      {nav && <PosNav exit className="order-last w-full self-end border-t border-[hsl(var(--border))] lg:order-none lg:ml-4 lg:w-auto lg:border-t-0" />}
      {modeSwitch}
      <span className="flex-1" />
      {online
        ? <span className="hidden items-center gap-1.5 text-sm font-medium text-[hsl(var(--muted-foreground))] sm:inline-flex"><Wifi className="h-4 w-4" aria-hidden="true" />En línea</span>
        : <StatusPill tone="danger" icon={WifiOff}>Sin conexión</StatusPill>}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="lg" className="h-11 gap-2" aria-label="Más operaciones de caja">
            <Menu className="h-5 w-5" aria-hidden="true" /><span className="hidden sm:inline">Más</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {onOrders && <DropdownMenuItem onSelect={onOrders} className="min-h-11"><Receipt className="mr-2 h-4 w-4" aria-hidden="true" />Órdenes y devoluciones</DropdownMenuItem>}
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
          {onChangeCaja && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onChangeCaja} disabled={saleInProgress} className="min-h-11">
                {saleInProgress ? <CircleSlash className="mr-2 h-4 w-4" aria-hidden="true" /> : <Repeat className="mr-2 h-4 w-4" aria-hidden="true" />}Cambiar de caja
              </DropdownMenuItem>
            </>
          )}
          {onExit && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onExit} className="min-h-11"><LogOut className="mr-2 h-4 w-4" aria-hidden="true" />Salir del POS</DropdownMenuItem>
            </>
          )}
          {onSignOut && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onSignOut} className="min-h-11"><LogOut className="mr-2 h-4 w-4" aria-hidden="true" />Salir (otro cajero)</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
