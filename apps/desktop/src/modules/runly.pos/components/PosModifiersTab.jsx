import { POS_ADMIN_TOUCH } from './adminTouch.js'
import { useMemo, useState } from 'react'
import { ListPlus, Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
  Button, EmptyState, Badge, SearchInput,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  TextField, SwitchField, Label,
} from '@runly/ui'
import { usePosCatalogProducts } from '../hooks/usePosCatalog'
import {
  useProductModifierGroups,
  useCreateModifierGroup,
  useUpdateModifierGroup,
  useCreateModifierOption,
  useUpdateModifierOption,
} from '../hooks/usePosModifiers'

const EMPTY_GROUP_FORM = { name: '', minSelect: '0', maxSelect: '1', required: false }
const EMPTY_OPTION_FORM = { name: '', priceDelta: '0' }

function ProductPicker({ selectedId, onSelect }) {
  const [search, setSearch] = useState('')
  const { data: products = [], isLoading } = usePosCatalogProducts()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return products
    return products.filter((p) => p.name?.toLowerCase().includes(q))
  }, [products, search])

  return (
    <Card className="lg:w-72 shrink-0">
      <CardHeader>
        <CardTitle>Productos</CardTitle>
        <CardDescription>Selecciona un producto para administrar sus modificadores.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto..." />
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando productos...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin resultados.</p>
        ) : (
          <ul className="flex max-h-112 flex-col gap-1 overflow-y-auto">
            {filtered.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelect(p)}
                  className={[
                    'w-full rounded-lg px-3 py-2 text-left text-sm transition-colors',
                    selectedId === p.id ? 'bg-foreground text-background' : 'hover:bg-muted',
                  ].join(' ')}
                >
                  <span className="block font-medium">{p.name}</span>
                  <span className={selectedId === p.id ? 'text-xs text-background/70' : 'text-xs text-muted-foreground'}>
                    ${parseFloat(p.price ?? p.base_price ?? 0).toFixed(2)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function GroupCard({ group, onEditGroup, onAddOption }) {
  const options = group.options ?? []
  const enabledCount = options.filter((o) => o.enabled).length

  function handleToggleOption(option, nextEnabled) {
    if (!nextEnabled && group.required && enabledCount <= 1 && option.enabled) {
      toast.warning('El grupo requerido quedará sin opciones y se omitirá en validación.')
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="text-base">{group.name}</CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            {group.required && <Badge variant="secondary">Requerido</Badge>}
            <Badge variant="outline">
              mín {group.minSelect ?? 0} / máx {group.maxSelect ?? 1}
            </Badge>
            <Badge variant={group.enabled ? 'success' : 'secondary'}>
              {group.enabled ? 'Activa' : 'Inactiva'}
            </Badge>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => onAddOption(group)}>
            <Plus size={14} className="mr-1" /> Opción
          </Button>
          <Button size="icon" variant="ghost" aria-label={`Editar grupo ${group.name}`} className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => onEditGroup(group)}>
            <Pencil size={14} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">Este grupo no tiene opciones.</p>
        ) : (
          <ul className="divide-y divide-border">
            {options.map((o) => (
              <OptionRow key={o.id} option={o} onBeforeToggle={handleToggleOption} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function OptionRow({ option, onBeforeToggle }) {
  const updateOption = useUpdateModifierOption()

  function handleToggle(nextEnabled) {
    onBeforeToggle(option, nextEnabled)
    updateOption.mutate({ id: option.id, data: { enabled: nextEnabled } })
  }

  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm">{option.name}</p>
        {Number(option.priceDelta) > 0 && (
          <p className="text-xs text-muted-foreground">+${parseFloat(option.priceDelta).toFixed(2)}</p>
        )}
      </div>
      <SwitchField touchTarget
        id={`option-${option.id}-enabled`}
        label={`Habilitar ${option.name}`}
        className="[&_label]:sr-only"
        checked={Boolean(option.enabled)}
        onChange={handleToggle}
        disabled={updateOption.isPending}
      />
    </li>
  )
}

export default function PosModifiersTab() {
  const [selectedProduct, setSelectedProduct] = useState(null)
  const { data: groups = [], isLoading: loadingGroups } = useProductModifierGroups(
    selectedProduct?.id,
    { includeDisabled: true },
  )

  const createGroup = useCreateModifierGroup()
  const updateGroup = useUpdateModifierGroup()
  const createOption = useCreateModifierOption()

  const [groupDialog, setGroupDialog] = useState(false)
  const [groupForm, setGroupForm] = useState(EMPTY_GROUP_FORM)

  const [editingGroup, setEditingGroup] = useState(null)
  const [editGroupForm, setEditGroupForm] = useState(EMPTY_GROUP_FORM)
  const [editGroupEnabled, setEditGroupEnabled] = useState(true)

  const [optionGroup, setOptionGroup] = useState(null)
  const [optionForm, setOptionForm] = useState(EMPTY_OPTION_FORM)

  function openEditGroup(group) {
    setEditingGroup(group)
    setEditGroupForm({
      name: group.name,
      minSelect: String(group.minSelect ?? 0),
      maxSelect: String(group.maxSelect ?? 1),
      required: Boolean(group.required),
    })
    setEditGroupEnabled(Boolean(group.enabled))
  }

  function handleCreateGroup() {
    createGroup.mutate(
      {
        productId: selectedProduct.id,
        data: {
          name: groupForm.name,
          minSelect: parseInt(groupForm.minSelect, 10) || 0,
          maxSelect: parseInt(groupForm.maxSelect, 10) || 1,
          required: groupForm.required,
        },
      },
      { onSuccess: () => { setGroupDialog(false); setGroupForm(EMPTY_GROUP_FORM) } },
    )
  }

  function handleUpdateGroup() {
    updateGroup.mutate(
      {
        id: editingGroup.id,
        data: {
          name: editGroupForm.name,
          minSelect: parseInt(editGroupForm.minSelect, 10) || 0,
          maxSelect: parseInt(editGroupForm.maxSelect, 10) || 1,
          required: editGroupForm.required,
          enabled: editGroupEnabled,
        },
      },
      { onSuccess: () => setEditingGroup(null) },
    )
  }

  function handleCreateOption() {
    createOption.mutate(
      {
        groupId: optionGroup.id,
        data: {
          name: optionForm.name,
          priceDelta: parseFloat(optionForm.priceDelta) || 0,
        },
      },
      { onSuccess: () => { setOptionGroup(null); setOptionForm(EMPTY_OPTION_FORM) } },
    )
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <ProductPicker selectedId={selectedProduct?.id} onSelect={setSelectedProduct} />

      <div className="flex-1 min-w-0">
        {!selectedProduct ? (
          <EmptyState title="Selecciona un producto" description="Elige un producto de la lista para ver y administrar sus grupos de modificadores." />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold">{selectedProduct.name}</h3>
                <p className="text-xs text-muted-foreground">Grupos de modificadores de este producto.</p>
              </div>
              <Button size="sm" onClick={() => setGroupDialog(true)}>
                <Plus size={14} className="mr-1" /> Nuevo grupo
              </Button>
            </div>

            {loadingGroups ? (
              <p className="text-sm text-muted-foreground">Cargando grupos...</p>
            ) : groups.length === 0 ? (
              <EmptyState title="Este producto no tiene grupos" description="Crea un grupo para ofrecer opciones como salsas, tamaños o extras." />
            ) : (
              <div className="flex flex-col gap-4">
                {groups.map((g) => (
                  <GroupCard
                    key={g.id}
                    group={g}
                    onEditGroup={openEditGroup}
                    onAddOption={(group) => setOptionGroup(group)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Nuevo grupo */}
      <Dialog open={groupDialog} onOpenChange={setGroupDialog}>
        <DialogContent size="md" className={POS_ADMIN_TOUCH}>
          <DialogHeader icon={ListPlus}>
            <DialogTitle>Nuevo grupo</DialogTitle>
            <DialogDescription>Define un grupo de modificadores para {selectedProduct?.name}.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleCreateGroup() }} className="flex flex-col gap-4 py-2">
            <TextField
              label="Nombre del grupo"
              required
              placeholder="Ej. Salsa"
              value={groupForm.name}
              onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Mínimo"
                type="number"
                min={0}
                value={groupForm.minSelect}
                onChange={(e) => setGroupForm((f) => ({ ...f, minSelect: e.target.value }))}
              />
              <TextField
                label="Máximo"
                type="number"
                min={1}
                value={groupForm.maxSelect}
                onChange={(e) => setGroupForm((f) => ({ ...f, maxSelect: e.target.value }))}
              />
            </div>
            <SwitchField touchTarget
              id="group-required"
              label="Requerido"
              description="El cliente debe elegir al menos una opción de este grupo."
              checked={groupForm.required}
              onChange={(v) => setGroupForm((f) => ({ ...f, required: v }))}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setGroupDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={!groupForm.name || createGroup.isPending}>
                {createGroup.isPending ? 'Creando...' : 'Crear grupo'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Editar grupo */}
      <Dialog open={Boolean(editingGroup)} onOpenChange={(v) => !v && setEditingGroup(null)}>
        <DialogContent size="md" className={POS_ADMIN_TOUCH}>
          <DialogHeader icon={ListPlus}>
            <DialogTitle>Editar grupo</DialogTitle>
            <DialogDescription>Modifica el nombre, límites o estado del grupo.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleUpdateGroup() }} className="flex flex-col gap-4 py-2">
            <TextField
              label="Nombre del grupo"
              required
              value={editGroupForm.name}
              onChange={(e) => setEditGroupForm((f) => ({ ...f, name: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Mínimo"
                type="number"
                min={0}
                value={editGroupForm.minSelect}
                onChange={(e) => setEditGroupForm((f) => ({ ...f, minSelect: e.target.value }))}
              />
              <TextField
                label="Máximo"
                type="number"
                min={1}
                value={editGroupForm.maxSelect}
                onChange={(e) => setEditGroupForm((f) => ({ ...f, maxSelect: e.target.value }))}
              />
            </div>
            <SwitchField touchTarget
              id="edit-group-required"
              label="Requerido"
              description="El cliente debe elegir al menos una opción de este grupo."
              checked={editGroupForm.required}
              onChange={(v) => setEditGroupForm((f) => ({ ...f, required: v }))}
            />
            <SwitchField touchTarget
              id="edit-group-enabled"
              label="Grupo activo"
              description="Los grupos inactivos no se muestran al tomar la comanda."
              checked={editGroupEnabled}
              onChange={setEditGroupEnabled}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditingGroup(null)}>Cancelar</Button>
              <Button type="submit" disabled={!editGroupForm.name || updateGroup.isPending}>
                {updateGroup.isPending ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Nueva opción */}
      <Dialog open={Boolean(optionGroup)} onOpenChange={(v) => !v && setOptionGroup(null)}>
        <DialogContent size="md" className={POS_ADMIN_TOUCH}>
          <DialogHeader icon={ListPlus}>
            <DialogTitle>Nueva opción</DialogTitle>
            <DialogDescription>Agrega una opción al grupo {optionGroup?.name}.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleCreateOption() }} className="flex flex-col gap-4 py-2">
            <TextField
              label="Nombre de la opción"
              required
              placeholder="Ej. Extra queso"
              value={optionForm.name}
              onChange={(e) => setOptionForm((f) => ({ ...f, name: e.target.value }))}
            />
            <TextField
              label="Precio adicional"
              type="number"
              min={0}
              step={0.01}
              value={optionForm.priceDelta}
              onChange={(e) => setOptionForm((f) => ({ ...f, priceDelta: e.target.value }))}
              hint="Usa 0 si la opción no tiene costo extra."
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOptionGroup(null)}>Cancelar</Button>
              <Button type="submit" disabled={!optionForm.name || createOption.isPending}>
                {createOption.isPending ? 'Creando...' : 'Crear opción'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
