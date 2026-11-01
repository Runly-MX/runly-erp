// apps/desktop/src/modules/runly.catalog/components/product/VariantOptionsCard.jsx
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, ConfirmDialog, Input, SectionCard, TextField } from '@runly/ui'
import { Plus, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { runly } from '../../../../lib/runly.js'
import { classifyCommerceError } from '../../lib/commerceCommand.js'

const splitValues = (text) => [...new Set(String(text).split(',').map((v) => v.trim()).filter(Boolean))]

// Options (Talla, Color...) and their values. The API requires at least one
// value per option, so an option is created together with its values.
// Removing a value never edits or deletes the variants that use it.
export default function VariantOptionsCard({ productId, token, options, variants, canUpdate }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [values, setValues] = useState('')
  const [errors, setErrors] = useState({})
  const [confirmDelete, setConfirmDelete] = useState(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['catalog-product', productId] })
  const onError = (err) => toast.error(classifyCommerceError(err).message)

  const create = useMutation({
    mutationFn: (data) => runly.catalog.createOption(productId, data, token),
    onSuccess: () => { setName(''); setValues(''); refresh(); toast.success('Opción agregada') },
    onError,
  })
  const update = useMutation({
    mutationFn: ({ optionId, values: next }) => runly.catalog.updateOption(productId, optionId, { values: next }, token),
    onSuccess: refresh,
    onError,
  })
  const remove = useMutation({
    mutationFn: (optionId) => runly.catalog.deleteOption(productId, optionId, token),
    onSuccess: () => { setConfirmDelete(null); refresh(); toast.success('Opción eliminada') },
    onError,
  })

  function submit(e) {
    e.preventDefault()
    const list = splitValues(values)
    const next = {}
    if (!name.trim()) next.name = 'Escribe el nombre de la opción, por ejemplo Talla.'
    else if (options.some((o) => o.name.toLowerCase() === name.trim().toLowerCase())) next.name = 'Ya existe una opción con ese nombre.'
    if (!list.length) next.values = 'Escribe al menos un valor. Separa varios con comas.'
    setErrors(next)
    if (Object.keys(next).length) return
    create.mutate({ name: name.trim(), position: options.length, values: list })
  }

  const usedBy = (option, value) => variants.filter((v) => v.option_values?.[option.name] === value).length

  return (
    <SectionCard title="Opciones" icon={SlidersHorizontal} description="Por ejemplo Talla: Chica, Mediana, Grande. Las combinaciones se crean abajo.">
      <div className="space-y-3">
        {options.length === 0 && <p className="text-sm text-[hsl(var(--muted-foreground))]">Todavía no hay opciones.</p>}
        {options.map((option) => (
          <OptionRow
            key={option.id}
            option={option}
            canUpdate={canUpdate}
            busy={update.isPending}
            usedBy={(value) => usedBy(option, value)}
            onAdd={(list) => {
              const current = option.values.map((v) => v.value)
              const fresh = list.filter((v) => !current.some((c) => c.toLowerCase() === v.toLowerCase()))
              if (fresh.length) update.mutate({ optionId: option.id, values: [...current, ...fresh] })
            }}
            onRemove={(value) => {
              const rest = option.values.map((v) => v.value).filter((v) => v !== value)
              if (!rest.length) { toast.error('Una opción necesita al menos un valor. Elimina la opción completa si ya no la usas.'); return }
              update.mutate({ optionId: option.id, values: rest })
            }}
            onDelete={() => setConfirmDelete(option)}
          />
        ))}

        {canUpdate && (
          <form onSubmit={submit} className="grid gap-3 rounded-xl border border-dashed border-[hsl(var(--border))] p-3 sm:grid-cols-[12rem_1fr_auto] sm:items-start" noValidate>
            <TextField label="Nueva opción" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder="Talla" maxLength={60} icon={null} />
            <TextField label="Valores" value={values} onChange={(e) => setValues(e.target.value)} error={errors.values} placeholder="Chica, Mediana, Grande" hint="Separa los valores con comas." icon={null} />
            <Button type="submit" variant="outline" size="lg" className="sm:mt-6" loading={create.isPending}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Agregar
            </Button>
          </form>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        icon={Trash2}
        tone="destructive"
        title={`Eliminar la opción ${confirmDelete?.name ?? ''}`}
        description="Las variantes existentes no se borran ni cambian: conservan su combinación, SKU, precio y existencias."
        confirmLabel="Eliminar opción"
        onConfirm={() => remove.mutate(confirmDelete.id)}
        loading={remove.isPending}
      />
    </SectionCard>
  )
}

function OptionRow({ option, canUpdate, busy, usedBy, onAdd, onRemove, onDelete }) {
  const [text, setText] = useState('')
  function add() {
    const list = splitValues(text)
    if (list.length) { onAdd(list); setText('') }
  }
  return (
    <div className="space-y-2 rounded-xl border border-[hsl(var(--border))] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[hsl(var(--foreground))]">{option.name}</p>
        {canUpdate && (
          <Button type="button" variant="ghost" size="icon" onClick={onDelete} aria-label={`Eliminar la opción ${option.name}`}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>
      <ul className="flex flex-wrap items-center gap-2" aria-label={`Valores de ${option.name}`}>
        {option.values.map((v) => {
          const count = usedBy(v.value)
          return (
            <li key={v.id} className="inline-flex h-9 items-center gap-1 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] pl-3 pr-1 text-sm font-medium text-[hsl(var(--foreground))]">
              {v.value}
              {count > 0 && <span className="text-xs text-[hsl(var(--muted-foreground))]">({count})</span>}
              {canUpdate && (
                <button
                  type="button"
                  onClick={() => onRemove(v.value)}
                  disabled={busy}
                  className="flex h-7 w-7 items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--background))] hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                  aria-label={`Quitar ${v.value}${count ? `, lo usan ${count} variantes que no cambiarán` : ''}`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </li>
          )
        })}
        {canUpdate && (
          <li className="flex items-center gap-1">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
              placeholder="Agregar valor"
              aria-label={`Agregar valor a ${option.name}`}
              className="h-9 w-36"
            />
            <Button type="button" variant="outline" size="icon" onClick={add} aria-label={`Agregar valor a ${option.name}`} disabled={busy}>
              <Plus className="h-4 w-4" aria-hidden="true" />
            </Button>
          </li>
        )}
      </ul>
    </div>
  )
}
