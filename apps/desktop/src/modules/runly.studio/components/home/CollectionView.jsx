import { useState } from 'react'
import { ActionMenu, ConfirmDialog, EmptyState } from '@runly/ui'
import { FolderOpen, Heart, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { DesignsList } from './DesignsList.jsx'
import { TemplateGrid } from './TemplateGrid.jsx'
import { CollectionFormDialog } from './CollectionsNav.jsx'
import { useCollections } from './CollectionsProvider.jsx'

// One collection: its designs and templates, with rename/delete for user collections.
export function CollectionView({ id, token, scopeKey, creating, onCreate, onOpen, onUseTemplate, onEditTemplateContent, onGone }) {
  const api = useCollections(), [renaming, setRenaming] = useState(false), [deleting, setDeleting] = useState(false)
  const current = api?.collections.find(row => (row.isFavorites ? 'favorites' : row.id) === id)
  if (!current) return null
  const empty = current.itemCount === 0
  async function remove() {
    try { await api.remove(current.id); toast.success('Colección eliminada.'); setDeleting(false); onGone() } catch (error) { toast.error(error?.message ?? 'No se pudo eliminar.') }
  }
  return (
    <section aria-labelledby="studio-collection-title" className="space-y-8">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 id="studio-collection-title" className="text-2xl font-bold tracking-tight sm:text-3xl">{current.name}</h1>
          <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">{current.isFavorites ? 'Lo que marcaste con el corazón.' : 'Tu colección personal.'} {current.itemCount} {current.itemCount === 1 ? 'elemento' : 'elementos'}.</p>
        </div>
        {!current.isFavorites ? <ActionMenu label={`Opciones de ${current.name}`} items={[{ label: 'Renombrar', icon: Pencil, onClick: () => setRenaming(true) }, { label: 'Eliminar colección', icon: Trash2, variant: 'destructive', onClick: () => setDeleting(true) }]} /> : null}
      </div>
      {empty ? (
        <EmptyState icon={current.isFavorites ? Heart : FolderOpen} title="Aún no hay nada aquí"
          description={current.isFavorites ? 'Toca el corazón de un diseño o una plantilla para guardarlo.' : 'Usa «Agregar a colección» en el menú de un diseño o una plantilla.'} />
      ) : (
        <>
          <DesignsList token={token} scopeKey={scopeKey} creating={creating} onCreate={onCreate} onOpen={onOpen} collection={id} hideEmpty heading="Diseños" />
          <TemplateGrid token={token} scopeKey={scopeKey} creating={creating} onUse={onUseTemplate} onEditContent={onEditTemplateContent} collection={id} hideEmpty limit={24} heading="Plantillas" />
        </>
      )}
      {renaming ? <CollectionFormDialog open collection={current} onOpenChange={setRenaming} /> : null}
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title="Eliminar colección" description={`«${current.name}» se eliminará. Los diseños y plantillas que contiene se conservan.`} confirmLabel="Eliminar colección" onConfirm={remove} />
    </section>
  )
}
