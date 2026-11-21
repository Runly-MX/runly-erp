import { useState } from 'react'
import {
  Button, ChoiceCardGroup, ComboboxField, EmptyState, NumberField, SectionCard, SelectField, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
  StatusPill, SwitchField, TextField, TextareaField,
} from '@runly/ui'
import { Gift, Loader2, Pencil, Plus, Receipt, Ticket } from 'lucide-react'
import { runly } from '../../../lib/runly.js'
import { formatDateTime } from '../../runly.bookings/lib/bookingsTime.js'
import { usePaidProducts, useTicketingMutation } from '../hooks/useTicketing.js'
import { MUTED, VISIBILITY, money, optionsOf } from '../lib/ticketingLabels.js'

// Ticket types and, per function, how many of each may be issued (empty = only the room limits it).
export function TypesTab({ event, canEdit }) {
  const [editing, setEditing] = useState(null)
  const types = event.types ?? []
  const add = canEdit ? <Button type="button" onClick={() => setEditing('new')}><Plus />Nuevo tipo</Button> : null
  return (
    <div className="space-y-4">
      <SectionCard title="Tipos de boleto" icon={Ticket} description="Gratis (se emiten al momento) o con precio (se cobran en Caja y se emiten al confirmar el pago)." action={types.length ? add : null}>
        {!types.length ? <EmptyState icon={Ticket} title="Sin tipos de boleto" description={canEdit ? 'Por ejemplo: General, VIP o Cortesía.' : undefined} action={add} /> : (
          <ul className="grid gap-3 md:grid-cols-2">
            {types.map((t) => <TypeCard key={t.id} type={t} event={event} canEdit={canEdit} onEdit={() => setEditing(t)} />)}
          </ul>
        )}
      </SectionCard>
      {editing ? <TypeSheet event={event} type={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  )
}

function TypeCard({ type, event, canEdit, onEdit }) {
  const paid = type.priceMode !== 'free'
  return (
    <li className="rounded-xl border border-[hsl(var(--border))] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{type.name}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <StatusPill tone={paid ? 'brand' : 'success'} size="sm" icon={paid ? Receipt : Gift}>{paid ? 'Con precio · Caja' : 'Gratis'}</StatusPill>
            <StatusPill tone="neutral" size="sm">{VISIBILITY[type.visibility]}</StatusPill>
            {!type.enabled ? <StatusPill tone="neutral" size="sm">Inactivo</StatusPill> : null}
          </div>
        </div>
        {canEdit ? <Button type="button" variant="ghost" size="sm" onClick={onEdit}><Pencil />Editar</Button> : null}
      </div>
      <p className={`${MUTED} mt-2`}>Hasta {type.perOrderMax} por orden{type.salesEnd ? ` · venta hasta ${formatDateTime(type.salesEnd, event.timezone ?? 'UTC')}` : ''}</p>
      {(event.sessions ?? []).length ? (
        <div className="mt-3 space-y-2 border-t border-[hsl(var(--border))] pt-3">
          <p className="text-xs font-medium">Cupo por función</p>
          {event.sessions.map((s) => <QuotaRow key={s.id} type={type} session={s} event={event} canEdit={canEdit} />)}
        </div>
      ) : null}
    </li>
  )
}

function QuotaRow({ type, session, event, canEdit }) {
  const current = type.quotas.find((q) => q.sessionId === session.id) ?? { quota: null, issued: 0 }
  const [value, setValue] = useState(current.quota == null ? '' : String(current.quota))
  const save = useTicketingMutation((t, quota) => runly.ticketing.setQuota(type.id, session.id, quota, t), { success: 'Cupo guardado.' })
  const dirty = value !== (current.quota == null ? '' : String(current.quota))
  const invalid = value !== '' && !(Number.parseInt(value, 10) >= current.issued)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-sm">{formatDateTime(session.startsAt, event.timezone ?? 'UTC')}</span>
      <span className={`${MUTED} tabular-nums`}>{current.issued} emitidos</span>
      {canEdit ? (
        <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); if (!invalid) save.mutate(value === '' ? null : Number.parseInt(value, 10)) }}>
          <NumberField aria-label={`Cupo de ${type.name}`} icon={null} min={current.issued} max={100000} allowDecimal={false} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Sin límite" className="h-9 w-28" error={invalid ? `Mínimo ${current.issued}` : undefined} />
          {dirty ? <Button type="submit" size="sm" variant="outline" disabled={save.isPending || invalid}>{save.isPending ? <Loader2 className="animate-spin" /> : null}Guardar</Button> : null}
        </form>
      ) : <span className="text-sm tabular-nums">{current.quota ?? 'Sin límite'}</span>}
    </div>
  )
}

function TypeSheet({ event, type, onClose }) {
  const products = usePaidProducts()
  const [form, setForm] = useState(() => ({
    name: type?.name ?? '', description: type?.description ?? '', priceMode: type?.priceMode ?? 'free', catalogProductId: type?.catalogProductId ?? '',
    perOrderMax: String(type?.perOrderMax ?? 10), visibility: type?.visibility ?? 'public', enabled: type?.enabled ?? true,
  }))
  const [errors, setErrors] = useState({})
  const save = useTicketingMutation((t, data) => (type ? runly.ticketing.updateType(type.id, data, t) : runly.ticketing.createType(event.id, data, t)), { success: 'Tipo de boleto guardado.' })
  const productOptions = (products.data ?? []).filter((p) => p.enabled !== false).map((p) => ({ value: p.id, label: `${p.name} · ${money(p.price, p.currency)}` }))

  async function submit(e) {
    e.preventDefault()
    const next = {}
    if (!form.name.trim()) next.name = 'Escribe un nombre.'
    if (!type && form.priceMode === 'pos' && !form.catalogProductId) next.product = 'Elige el producto que se cobra en Caja.'
    const max = Number.parseInt(form.perOrderMax, 10)
    if (!(max >= 1 && max <= 100)) next.perOrderMax = 'Entre 1 y 100.'
    setErrors(next)
    if (Object.keys(next).length) return
    const base = { name: form.name.trim(), description: form.description.trim() || null, perOrderMax: max, visibility: form.visibility }
    const data = type ? { ...base, enabled: form.enabled } : { ...base, priceMode: form.priceMode, catalogProductId: form.priceMode === 'pos' ? form.catalogProductId : null }
    if (await save.mutateAsync(data).then(() => true).catch(() => false)) onClose()
  }

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <SheetHeader className="shrink-0 border-b border-[hsl(var(--border))] px-5 py-4">
            <SheetTitle>{type ? `Editar ${type.name}` : 'Nuevo tipo de boleto'}</SheetTitle>
            <SheetDescription>{type ? 'El precio no cambia una vez creado: crea otro tipo si necesitas otro precio.' : 'Cómo se llama, si cuesta y quién lo puede comprar.'}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
            <section className="space-y-4">
              <TextField label="Nombre" required value={form.name} error={errors.name} maxLength={120} placeholder="Ej. General" autoFocus onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              <TextareaField label="Descripción" value={form.description} rows={2} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </section>
            {!type ? (
              <section className="space-y-3 border-t border-[hsl(var(--border))] pt-5">
                <p className="text-sm font-semibold">Precio</p>
                <ChoiceCardGroup ariaLabel="Precio" columns={2} value={form.priceMode} onChange={(priceMode) => setForm((f) => ({ ...f, priceMode }))}
                  options={[{ value: 'free', label: 'Gratis', icon: Gift, description: 'Se emite al momento.' }, { value: 'pos', label: 'Con precio', icon: Receipt, description: 'Se cobra en Caja.' }]} />
                {form.priceMode === 'pos' ? (
                  <div className="space-y-1.5">
                    <ComboboxField label="Producto del catálogo" options={productOptions} value={form.catalogProductId} onValueChange={(catalogProductId) => setForm((f) => ({ ...f, catalogProductId }))} placeholder={products.isPending ? 'Cargando productos…' : 'Buscar producto…'} error={errors.product} />
                    <p className={MUTED}>Caja cobra el precio de este producto. Al confirmar el pago se compara la venta con el precio vigente al apartar.</p>
                  </div>
                ) : null}
              </section>
            ) : null}
            <section className="space-y-4 border-t border-[hsl(var(--border))] pt-5">
              <p className="text-sm font-semibold">Límites</p>
              <NumberField label="Máximo por orden" icon={null} min={1} max={100} allowDecimal={false} value={form.perOrderMax} error={errors.perOrderMax} onChange={(e) => setForm((f) => ({ ...f, perOrderMax: e.target.value }))} />
              <SelectField label="Quién lo puede obtener" options={optionsOf(VISIBILITY)} value={form.visibility} onValueChange={(visibility) => setForm((f) => ({ ...f, visibility }))} hint="Taquilla siempre puede emitir todos los tipos." />
              {type ? <SwitchField id="ticketing-type-enabled" label="Tipo activo" description="Un tipo inactivo deja de emitirse; los boletos existentes se conservan." checked={form.enabled} onChange={(enabled) => setForm((f) => ({ ...f, enabled }))} /> : null}
            </section>
          </div>
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[hsl(var(--border))] px-5 py-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={save.isPending}>{save.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}{type ? 'Guardar' : 'Crear tipo'}</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
