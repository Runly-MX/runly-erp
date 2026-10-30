import { useNavigate } from 'react-router-dom'
import { ChevronDown, ClipboardList, FileQuestion, Plus, ReceiptText } from 'lucide-react'
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, cn } from '@runly/ui'
import { useCapabilities, usePurchasesCan } from '../hooks/usePurchases.js'
import { KINDS, ROOT } from '../lib/purchases-constants.js'

// What "a new purchase" can start with in this company, most common first:
// only the documents whose capability is on and the user may create.
export function purchaseStarters(has, can) {
  return [
    has('invoices') && can(KINDS.invoices.create) && { kind: 'invoices', label: KINDS.invoices.newLabel, icon: ReceiptText },
    has('purchaseOrders') && can(KINDS.orders.create) && { kind: 'orders', label: KINDS.orders.newLabel, icon: ClipboardList },
    has('requests') && can(KINDS.requests.create) && { kind: 'requests', label: KINDS.requests.newLabel, icon: FileQuestion },
  ].filter(Boolean)
}

// One entry point to create: a plain button when only one document applies,
// "Nueva compra" with a menu when there are several, nothing when none.
export function NewPurchaseButton({ className, block = false }) {
  const navigate = useNavigate()
  const caps = useCapabilities()
  const can = usePurchasesCan()
  const starters = caps.isLoading ? [] : purchaseStarters(caps.has, can)
  if (!starters.length) return null
  const go = (kind) => navigate(`${ROOT}/${kind}/new`)

  if (starters.length === 1) {
    const [only] = starters
    const Icon = only.icon
    return <Button className={cn(block && 'w-full', className)} onClick={() => go(only.kind)}><Icon className="h-4 w-4" />{only.label}</Button>
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className={cn(block && 'w-full justify-between', className)}>
          <span className="flex items-center gap-2"><Plus className="h-4 w-4" />Nueva compra</span>
          <ChevronDown className="h-4 w-4 opacity-80" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={block ? 'start' : 'end'} className="min-w-52">
        {starters.map(({ kind, label, icon: Icon }) => (
          <DropdownMenuItem key={kind} onClick={() => go(kind)} className="cursor-pointer gap-2">
            <Icon className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />{label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Sidebar slot (above the navigation): the same entry point, full width.
export function PurchasesSidebarSlot() {
  return <NewPurchaseButton block />
}
PurchasesSidebarSlot.placement = 'top'
