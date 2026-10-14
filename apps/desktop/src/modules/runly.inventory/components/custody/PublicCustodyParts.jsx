import { Badge, DataTable, Skeleton } from '@runly/ui'
import { ArrowDownLeft, ArrowUpRight, Building2, CalendarDays, ShieldCheck } from 'lucide-react'
import { CUSTODY_KIND, formatCustodyDate } from '../../lib/custody-api.js'

export const muted = 'text-[hsl(var(--muted-foreground))]'
const card = 'rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]'

// [field, label, mono]
const ITEM_FIELDS = [
  ['typeBrand', 'Tipo / marca'],
  ['model', 'Modelo'],
  ['serialNumber', 'Serie', true],
  ['assetTag', 'Etiqueta', true],
  ['invoiceNumber', 'Factura'],
  ['features', 'Características'],
]

const ITEM_COLUMNS = [
  { accessorKey: 'index', header: '#', enableSorting: false, cell: ({ row }) => <span className={`tabular-nums ${muted}`}>{row.original.index}</span> },
  ...ITEM_FIELDS.map(([key, label, mono]) => ({
    accessorKey: key, header: label, enableSorting: false,
    cell: ({ row }) => <span className={mono ? 'font-mono text-xs' : 'whitespace-pre-line'}>{row.original[key] || '—'}</span>,
  })),
]

// Company brand bar shown on every state of the page.
export function BrandBar({ companyName, logoUrl, loading }) {
  return (
    <header className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3 md:px-8">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-md object-contain" />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--muted))]">
            <Building2 className={`h-4 w-4 ${muted}`} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          {loading ? <Skeleton className="h-4 w-40" /> : (
            <p className="truncate text-sm font-semibold">{companyName || 'Resguardo de equipo'}</p>
          )}
        </div>
        <span className={`flex shrink-0 items-center gap-1 text-xs ${muted}`}>
          <ShieldCheck className="h-3.5 w-3.5" />Enlace seguro
        </span>
      </div>
    </header>
  )
}

// Title block: "Resguardo de equipo", folio, kind badge and date.
export function CustodyHero({ custody }) {
  return (
    <section className="space-y-3">
      <p className={`text-xs font-medium uppercase tracking-wider ${muted}`}>Firma de conformidad</p>
      <h1 className="text-2xl font-semibold leading-tight tracking-tight md:text-3xl">Resguardo de equipo</h1>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-2 py-0.5 font-mono text-xs">{custody.folio}</span>
        <Badge variant={custody.kind === 'RETURN' ? 'warning' : 'success'}>{CUSTODY_KIND[custody.kind] ?? 'Entrega'}</Badge>
        <span className={`flex items-center gap-1.5 ${muted}`}>
          <CalendarDays className="h-3.5 w-3.5" />{formatCustodyDate(custody.date)}
        </span>
      </div>
    </section>
  )
}

function PartyCard({ icon: Icon, label, name, detail }) {
  return (
    <div className={`${card} flex items-start gap-3 p-4`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--muted))]">
        <Icon className={`h-4 w-4 ${muted}`} />
      </span>
      <div className="min-w-0">
        <p className={`text-xs ${muted}`}>{label}</p>
        <p className="mt-0.5 font-medium wrap-break-word">{name || '—'}</p>
        {detail ? <p className={`text-xs ${muted} wrap-break-word`}>{detail}</p> : null}
      </div>
    </div>
  )
}

// Who hands the equipment over and who takes it. In a return the employee
// hands it back and the deliverer receives it.
export function Parties({ custody }) {
  const employeeRole = [custody.receiverJobTitle, custody.receiverDepartment].filter(Boolean).join(' · ')
  const isReturn = custody.kind === 'RETURN'
  const giver = isReturn ? { name: custody.receiverName, detail: employeeRole } : { name: custody.delivererName }
  const taker = isReturn ? { name: custody.delivererName } : { name: custody.receiverName, detail: employeeRole }
  return (
    <section className="grid gap-3 sm:grid-cols-2">
      <PartyCard icon={ArrowUpRight} label="Quién entrega" {...giver} />
      <PartyCard icon={ArrowDownLeft} label="Quién recibe" {...taker} />
    </section>
  )
}

// Items as cards on phones and as a table from md.
export function ItemsList({ items, count }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">
        Equipo <span className={`font-normal ${muted}`}>({count ?? items.length})</span>
      </h2>
      <div className="hidden md:block">
        <DataTable columns={ITEM_COLUMNS} data={items} getRowId={(row) => String(row.index)}
          showToolbar={false} showPagination={items.length > 20} emptyTitle="Sin artículos" />
      </div>
      <ul className="space-y-2.5 md:hidden">
        {items.map((row) => (
          <li key={row.index} className={`${card} p-3.5`}>
            <div className="flex items-start gap-3">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--muted))] text-xs tabular-nums ${muted}`}>
                {row.index}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium leading-snug wrap-break-word">{row.typeBrand || 'Artículo'}</p>
                {row.model ? <p className={`text-sm ${muted} wrap-break-word`}>{row.model}</p> : null}
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-[hsl(var(--border))] pt-3 text-xs">
              {ITEM_FIELDS.slice(2).map(([key, label, mono]) => (
                <div key={key} className={key === 'features' ? 'col-span-2' : 'min-w-0'}>
                  <dt className={muted}>{label}</dt>
                  <dd className={`mt-0.5 wrap-break-word ${mono ? 'font-mono' : 'whitespace-pre-line'}`}>{row[key] || '—'}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function LegalNotice({ isReturn }) {
  return (
    <section className="flex gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)] p-4">
      <ShieldCheck className={`mt-0.5 h-5 w-5 shrink-0 ${muted}`} />
      <div className="space-y-1 text-sm">
        <p className="font-medium">Declaración</p>
        <p className={`leading-relaxed ${muted}`}>
          {isReturn
            ? 'Al firmar confirmo que devuelvo el equipo listado y que su estado corresponde a lo descrito en este resguardo.'
            : 'Al firmar confirmo que recibo el equipo listado en buen estado y me hago responsable de su uso y resguardo conforme a las políticas de la empresa, hasta su devolución.'}
        </p>
        <p className={`text-xs ${muted}`}>Tu firma, la fecha y la hora quedan registradas en el resguardo.</p>
      </div>
    </section>
  )
}

// Centered panel for the closed states (expired, cancelled, signed).
export function StatusPanel({ icon: Icon, tone = 'muted', title, description, children }) {
  const tones = {
    muted: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
    success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    danger: 'bg-[hsl(var(--destructive)/0.1)] text-[hsl(var(--destructive))]',
  }
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-12 text-center md:py-20">
      <span className={`flex h-16 w-16 items-center justify-center rounded-full ${tones[tone] ?? tones.muted}`}>
        <Icon className="h-8 w-8" />
      </span>
      <h1 className="mt-5 text-xl font-semibold tracking-tight">{title}</h1>
      {description ? <p className={`mt-2 text-sm leading-relaxed ${muted}`}>{description}</p> : null}
      {children ? <div className="mt-6 w-full">{children}</div> : null}
    </div>
  )
}

// Folio / kind / date / items summary for the signed state.
export function SignedSummary({ custody, signedAt }) {
  const rows = [
    ['Folio', <span key="f" className="font-mono">{custody.folio}</span>],
    ['Tipo', CUSTODY_KIND[custody.kind] ?? '—'],
    ['Fecha', formatCustodyDate(custody.date)],
    ['Artículos', custody.itemCount],
    ...(signedAt ? [['Firmado', new Date(signedAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })]] : []),
  ]
  return (
    <dl className={`${card} divide-y divide-[hsl(var(--border))] text-left text-sm`}>
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-3 px-4 py-2.5">
          <dt className={muted}>{label}</dt>
          <dd className="text-right font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
