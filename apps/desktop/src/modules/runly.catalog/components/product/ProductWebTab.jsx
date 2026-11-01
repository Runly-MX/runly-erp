// apps/desktop/src/modules/runly.catalog/components/product/ProductWebTab.jsx
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, NumberField, SectionCard, StatusPill, TextField, TextareaField } from '@runly/ui'
import { Eye, EyeOff, FileClock, Globe, Info, Search, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { runly } from '../../../../lib/runly.js'
import { classifyCommerceError } from '../../lib/commerceCommand.js'
import { slugify } from '../../lib/catalogRules.js'
import SaveBar from './SaveBar.jsx'

function snapshot(product) {
  return {
    slug: product.slug ?? '',
    meta_title: product.meta_title ?? null,
    meta_description: product.meta_description ?? null,
    weight: product.weight != null ? Number(product.weight) : null,
  }
}

// Web catalog only: publishing here never enables or disables the product
// in POS (that is the Venta tab), and the product stays active either way.
export default function ProductWebTab({ product, token, access, saver, productId }) {
  const queryClient = useQueryClient()
  const [base, setBase] = useState(() => snapshot(product))
  const [form, setForm] = useState(() => snapshot(product))
  const [errors, setErrors] = useState({})
  const readOnly = !access.canUpdate

  const publish = useMutation({
    mutationFn: (next) => (next ? runly.catalog.publishProduct(productId, token) : runly.catalog.unpublishProduct(productId, token)),
    onSuccess: (_, next) => {
      toast.success(next ? 'Publicado en la web' : 'Retirado de la web')
      queryClient.invalidateQueries({ queryKey: ['catalog-product', productId] })
      queryClient.invalidateQueries({ queryKey: ['catalog-products'] })
      queryClient.invalidateQueries({ queryKey: ['catalog-product-stats'] })
    },
    onError: (err) => toast.error(classifyCommerceError(err).message),
  })

  const next = {
    slug: form.slug.trim(),
    meta_title: form.meta_title?.trim() || null,
    meta_description: form.meta_description?.trim() || null,
    weight: form.weight === '' || form.weight == null ? null : Number(form.weight),
  }
  const changed = Object.keys(next).filter((k) => (next[k] ?? null) !== (base[k] ?? null))

  function submit(e) {
    e.preventDefault()
    const nextErrors = {}
    if (!/^[a-z0-9-]+$/.test(next.slug)) nextErrors.slug = 'Usa sólo minúsculas sin acentos, números y guiones.'
    if (next.weight != null && !(next.weight >= 0)) nextErrors.weight = 'El peso no puede ser negativo.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    const data = Object.fromEntries(changed.map((k) => [k, next[k]]))
    saver.save(data, base, { onSaved: () => setBase((b) => ({ ...b, ...data })) })
  }

  return (
    <div className="space-y-5">
      <SectionCard title="Catálogo web" icon={Globe}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 space-y-1">
            {product.published
              ? <StatusPill tone="success" icon={Eye}>Publicado en la web</StatusPill>
              : <StatusPill tone="neutral" icon={FileClock}>Borrador: no visible en la web</StatusPill>}
            <p className="flex items-start gap-2 text-sm text-[hsl(var(--muted-foreground))]">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Publicar no lo habilita en el punto de venta, y retirarlo de la web no lo quita de POS.
            </p>
          </div>
          {!readOnly && (
            <Button type="button" size="lg" variant={product.published ? 'outline' : 'default'} onClick={() => publish.mutate(!product.published)} loading={publish.isPending}>
              {product.published ? <><EyeOff className="h-4 w-4" aria-hidden="true" /> Retirar de la web</> : <><Eye className="h-4 w-4" aria-hidden="true" /> Publicar en la web</>}
            </Button>
          )}
        </div>
      </SectionCard>

      <form onSubmit={submit} className="space-y-5">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <SectionCard title="Buscadores y dirección" icon={Search} description="Opcional. Si lo dejas vacío se usan el nombre y la descripción.">
              <div className="space-y-4">
                <TextField
                  label="Dirección web"
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  onBlur={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value) || f.slug }))}
                  error={errors.slug}
                  hint={`Aparece al final del enlace: /p/${next.slug || '...'}`}
                  maxLength={200}
                  disabled={readOnly}
                  icon={null}
                />
                <TextField label="Título para buscadores" value={form.meta_title ?? ''} onChange={(e) => setForm((f) => ({ ...f, meta_title: e.target.value }))} placeholder={product.name} maxLength={160} hint={`${(form.meta_title ?? '').length} de 160`} disabled={readOnly} icon={null} />
                <TextareaField label="Descripción para buscadores" value={form.meta_description ?? ''} onChange={(e) => setForm((f) => ({ ...f, meta_description: e.target.value }))} maxLength={320} rows={3} hint={`${(form.meta_description ?? '').length} de 320`} disabled={readOnly} />
              </div>
            </SectionCard>
          </div>
          <div className="space-y-5">
            <SectionCard title="Envío" icon={Truck} description="Sólo para ventas en línea con envío.">
              <NumberField label="Peso (kg)" value={form.weight ?? ''} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value === '' ? null : e.target.value }))} min={0} step={0.001} error={errors.weight} disabled={readOnly} />
            </SectionCard>
            <SectionCard title="Vista previa en buscadores" icon={Search}>
              <div className="space-y-0.5">
                <p className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">{next.meta_title || product.name}</p>
                <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">tudominio.com/p/{next.slug}</p>
                <p className="line-clamp-3 text-xs text-[hsl(var(--muted-foreground))]">{next.meta_description || product.description || 'Sin descripción.'}</p>
              </div>
            </SectionCard>
          </div>
        </div>
        {!readOnly && <SaveBar dirty={changed.length > 0} saving={saver.saving} onDiscard={() => { setForm(base); setErrors({}) }} />}
      </form>
    </div>
  )
}
