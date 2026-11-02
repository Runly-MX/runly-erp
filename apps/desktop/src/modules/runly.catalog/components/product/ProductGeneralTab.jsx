// apps/desktop/src/modules/runly.catalog/components/product/ProductGeneralTab.jsx
import { useState } from 'react'
import { Button, ComboboxField, MarkdownField, SectionCard, SortableList, TextField, cn } from '@runly/ui'
import { ChevronDown, FileEdit, FolderTree, GripVertical, Images, ListPlus, Trash2 } from 'lucide-react'
import { useCatalogCategories } from '../../lib/catalogData.js'
import ProductImageManager from '../ProductImageManager.jsx'
import SaveBar from './SaveBar.jsx'

let localIdSeq = 0
const withLocalId = (attr) => ({ ...attr, id: attr.id ?? `attr-${localIdSeq++}` })

function snapshot(product) {
  return {
    name: product.name ?? '',
    description: product.description ?? '',
    category_id: product.category_id ?? null,
    attributes: Array.isArray(product.attributes) ? product.attributes.map(({ key, value }) => ({ key, value })) : [],
  }
}

export default function ProductGeneralTab({ product, token, access, saver }) {
  const categories = useCatalogCategories(token)
  const [base, setBase] = useState(() => snapshot(product))
  const [form, setForm] = useState(() => ({ ...snapshot(product), attributes: snapshot(product).attributes.map(withLocalId) }))
  const [showAttributes, setShowAttributes] = useState(() => snapshot(product).attributes.length > 0)
  const [nameError, setNameError] = useState('')
  const readOnly = !access.canUpdate

  const next = {
    name: form.name.trim(),
    description: form.description || null,
    category_id: form.category_id || null,
    attributes: form.attributes.filter((a) => a.key?.trim()).map(({ key, value }) => ({ key: key.trim(), value: value ?? '' })),
  }
  const changed = Object.keys(next).filter((k) => JSON.stringify(next[k] ?? null) !== JSON.stringify(base[k] || (k === 'attributes' ? [] : null)))

  function submit(e) {
    e?.preventDefault()
    if (!next.name) { setNameError('Escribe el nombre del producto.'); return }
    setNameError('')
    const data = Object.fromEntries(changed.map((k) => [k, next[k]]))
    saver.save(data, base, { onSaved: () => setBase((b) => ({ ...b, ...data })) })
  }

  function setAttr(id, field, value) {
    setForm((f) => ({ ...f, attributes: f.attributes.map((a) => (a.id === id ? { ...a, [field]: value } : a)) }))
  }

  const categoryOptions = [{ value: '', label: 'Sin categoría' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <SectionCard title="Información básica" icon={FileEdit}>
            <div className="space-y-4">
              <TextField label="Nombre" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} error={nameError} maxLength={200} disabled={readOnly} />
              <MarkdownField
                label="Descripción"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Qué es, de qué está hecho, para quién es..."
                disabled={readOnly}
              />
            </div>
          </SectionCard>

          <SectionCard
            title="Atributos"
            icon={ListPlus}
            description="Datos de ficha técnica, como material o medidas. Opcional."
            action={!showAttributes && (
              <Button type="button" variant="outline" onClick={() => setShowAttributes(true)} disabled={readOnly}>
                Agregar atributos <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          >
            {showAttributes && (
              <div className="space-y-2">
                <SortableList
                  items={form.attributes}
                  onReorder={(items) => setForm((f) => ({ ...f, attributes: items }))}
                  renderItem={(a, { dragHandleProps, isDragging }) => (
                    <div className={cn('flex items-center gap-2 py-1', isDragging && 'opacity-50')}>
                      <button type="button" {...dragHandleProps} className="flex h-11 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-[hsl(var(--muted-foreground))]" aria-label="Arrastrar para reordenar">
                        <GripVertical className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <TextField aria-label="Atributo" value={a.key} onChange={(e) => setAttr(a.id, 'key', e.target.value)} placeholder="Material" className="w-40" icon={null} disabled={readOnly} />
                      <TextField aria-label="Valor" value={a.value} onChange={(e) => setAttr(a.id, 'value', e.target.value)} placeholder="Algodón" className="flex-1" icon={null} disabled={readOnly} />
                      <Button type="button" variant="ghost" size="icon" onClick={() => setForm((f) => ({ ...f, attributes: f.attributes.filter((x) => x.id !== a.id) }))} aria-label={`Quitar atributo ${a.key || ''}`} disabled={readOnly}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  )}
                />
                <Button type="button" variant="outline" onClick={() => setForm((f) => ({ ...f, attributes: [...f.attributes, withLocalId({ key: '', value: '' })] }))} disabled={readOnly}>
                  Agregar atributo
                </Button>
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard title="Imágenes" icon={Images} description="La primera es la portada. Se guardan al subirlas.">
            <ProductImageManager
              token={token}
              coverId={product.cover_asset_id}
              imageIds={Array.isArray(product.images) ? product.images : []}
              onChange={({ coverId, imageIds }) => !readOnly && saver.save({ cover_asset_id: coverId, images: imageIds }, null, { successMessage: 'Imágenes guardadas' })}
            />
          </SectionCard>
          <SectionCard title="Organización" icon={FolderTree}>
            <ComboboxField
              label="Categoría"
              options={categoryOptions}
              value={form.category_id ?? ''}
              onChange={(v) => setForm((f) => ({ ...f, category_id: v || null }))}
              placeholder="Sin categoría"
              searchPlaceholder="Buscar categoría..."
              emptyText="Sin resultados"
              disabled={readOnly}
            />
          </SectionCard>
        </div>
      </div>

      {!readOnly && <SaveBar dirty={changed.length > 0} saving={saver.saving} onDiscard={() => setForm({ ...base, attributes: base.attributes.map(withLocalId) })} />}
    </form>
  )
}
