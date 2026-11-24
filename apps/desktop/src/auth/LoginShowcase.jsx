import { ShoppingCart, CalendarDays, Package, Sparkles } from 'lucide-react'

// Illustrative fragments of real Runly screens for the login hero. Static
// sample data on purpose: this screen is shared by every company on the
// instance and runs before sign-in, so nothing here may come from the API.

function FloatCard({ className, delay = 0, children }) {
  return (
    <div
      className={`auth-float absolute rounded-2xl glass p-4 shadow-xl ${className}`}
      style={{ animation: `authFloat 7s ease-in-out ${delay}s infinite` }}
    >
      {children}
    </div>
  )
}

function CardTitle({ icon: Icon, tone, label, meta }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <span className={`grid place-items-center w-7 h-7 rounded-md ${tone}`}>
        <Icon size={14} aria-hidden="true" />
      </span>
      <span className="text-[13px] font-semibold text-foreground">{label}</span>
      {meta && <span className="ml-auto text-[11px] text-muted-foreground">{meta}</span>}
    </div>
  )
}

const TICKET_LINES = [
  ['Café americano x2', '$96.00'],
  ['Sándwich de pavo', '$145.00'],
  ['Agua mineral', '$38.00'],
]

const EVENTS = [
  { time: '10:00', title: 'Junta de ventas', bar: 'bg-sky-500' },
  { time: '13:30', title: 'Entrega a cliente', bar: 'bg-(--brand-primary)' },
]

export function LoginShowcase() {
  return (
    <div aria-hidden="true" className="relative w-full h-[440px] select-none">
      <FloatCard className="left-0 top-6 w-64" delay={0}>
        <CardTitle icon={ShoppingCart} tone="bg-orange-500/15 text-orange-500" label="Venta #1042" meta="Caja 1" />
        <ul className="space-y-1.5 text-[12px]">
          {TICKET_LINES.map(([item, price]) => (
            <li key={item} className="flex justify-between text-muted-foreground">
              <span>{item}</span><span className="tabular-nums">{price}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
          <span className="text-[11px] font-medium rounded-md px-2 py-0.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">Cobrado</span>
          <span className="text-sm font-bold tabular-nums text-foreground">$279.00</span>
        </div>
      </FloatCard>

      <FloatCard className="right-2 top-0 w-60" delay={1.6}>
        <CardTitle icon={CalendarDays} tone="bg-sky-500/15 text-sky-500" label="Hoy" meta="3 eventos" />
        <ul className="space-y-2">
          {EVENTS.map((ev) => (
            <li key={ev.title} className="flex items-stretch gap-2.5">
              <span className={`w-1 rounded-full ${ev.bar}`} />
              <span className="flex flex-col">
                <span className="text-[12px] font-medium text-foreground">{ev.title}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums">{ev.time}</span>
              </span>
            </li>
          ))}
        </ul>
      </FloatCard>

      <FloatCard className="left-14 bottom-4 w-64" delay={3.1}>
        <CardTitle icon={Package} tone="bg-violet-500/15 text-violet-500" label="Laptop Latitude 5440" />
        <dl className="grid grid-cols-2 gap-y-1.5 text-[12px]">
          <dt className="text-muted-foreground">Número de activo</dt>
          <dd className="text-right font-medium text-foreground tabular-nums">INV-00231</dd>
          <dt className="text-muted-foreground">Ubicación</dt>
          <dd className="text-right text-foreground">Oficina central</dd>
        </dl>
        <span className="mt-3 inline-block text-[11px] font-medium rounded-md px-2 py-0.5 bg-sky-500/15 text-sky-600 dark:text-sky-400">En uso</span>
      </FloatCard>

      <FloatCard className="right-0 bottom-20 w-64" delay={4.4}>
        <CardTitle icon={Sparkles} tone="bg-(--brand-primary)/15 text-(--brand-primary)" label="MirAI" meta="ahora" />
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Las ventas de hoy van <span className="font-semibold text-foreground">18% arriba</span> de la semana pasada. ¿Quieres ver el detalle por sucursal?
        </p>
      </FloatCard>
    </div>
  )
}
