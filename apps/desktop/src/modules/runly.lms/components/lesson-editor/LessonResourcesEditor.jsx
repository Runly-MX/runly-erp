import { useEffect, useState } from 'react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  AdvancedFileViewer, Button, ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  ErrorState, FileUploader, FileVisual, Skeleton, TextField, buttonVariants, cn, formatBytes,
} from '@runly/ui'
import { Download, Eye, FolderOpen, Loader2, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useUploadLmsFile } from '../../hooks/useLmsData.js'
import { useLmsFileViewer } from '../../hooks/useLmsFileViewer.js'
import { useAddResource, useDeleteResource, useLessonResources, useReorderResources, useUpdateResource } from '../../hooks/useLmsExperience.js'
import { moveItem, resourceName } from '../../lib/lmsExperience.js'
import { resourceInput } from '../../lib/lmsFiles.js'
import { DragHandle } from '../curriculum/DragHandle.jsx'

function RenameDialog({ resource, onOpenChange, onSubmit, pending }) {
  const [title, setTitle] = useState('')
  useEffect(() => { if (resource) setTitle(resource.title ?? '') }, [resource])
  return (
    <Dialog open={Boolean(resource)} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form onSubmit={(event) => { event.preventDefault(); onSubmit(title.trim()) }}>
          <DialogHeader icon={Pencil}>
            <DialogTitle>Renombrar recurso</DialogTitle>
            <DialogDescription>El nombre que ven los alumnos en la pestaña Recursos. Déjalo vacío para mostrar el nombre del archivo.</DialogDescription>
          </DialogHeader>
          <TextField label="Nombre" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} placeholder={resource?.fileName ?? 'Ej. Guía de estudio'} autoComplete="off" />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ResourceRow({ resource, readOnly, onOpen, onRename, onDelete }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: resource.id, disabled: readOnly })
  const handleProps = readOnly ? null : { ...attributes, ...listeners, ref: setActivatorNodeRef }
  const name = resourceName(resource)
  const meta = [resource.title?.trim() && resource.fileName ? resource.fileName : null, resource.sizeBytes ? formatBytes(resource.sizeBytes) : null].filter(Boolean).join(' · ')
  return (
    <li
      ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('flex items-center gap-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-1.5 pl-1 pr-1.5', isDragging && 'z-10 opacity-60 shadow-lg')}
    >
      <DragHandle handleProps={handleProps} label={`Mover el recurso «${name}»`} />
      <FileVisual file={{ originalName: resource.fileName ?? name, mimeType: resource.mimeType }} className={cn('h-9 w-9 shrink-0 rounded-md', readOnly && 'ml-1')} />
      <button
        type="button" onClick={resource.url ? () => onOpen(resource) : undefined} disabled={!resource.url} title={resource.url ? `Abrir ${name}` : undefined}
        className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-default"
      >
        <p className="truncate text-sm font-medium">{name}</p>
        {meta ? <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{meta}</p> : null}
      </button>
      {resource.url ? (
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Abrir ${name}`} title="Abrir" onClick={() => onOpen(resource)}><Eye /></Button>
      ) : null}
      {resource.url ? (
        <a href={resource.url} target="_blank" rel="noreferrer" download={resource.fileName || true} aria-label={`Descargar ${name}`} title="Descargar" className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}>
          <Download />
        </a>
      ) : null}
      {!readOnly ? (
        <>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Renombrar ${name}`} title="Renombrar" onClick={() => onRename(resource)}><Pencil /></Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Eliminar ${name}`} title="Eliminar" className="text-[hsl(var(--destructive))]" onClick={() => onDelete(resource)}><Trash2 /></Button>
        </>
      ) : null}
    </li>
  )
}

// Downloadable files of a lesson (Recursos tab in the player): upload through
// /files/upload, drag to reorder, rename and remove. Needs a saved lesson.
export function LessonResourcesEditor({ lessonId, readOnly = false }) {
  const query = useLessonResources(lessonId)
  const upload = useUploadLmsFile()
  const add = useAddResource(lessonId), update = useUpdateResource(lessonId), remove = useDeleteResource(lessonId), reorder = useReorderResources(lessonId)
  const [renaming, setRenaming] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const viewer = useLmsFileViewer()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const items = query.data ?? []
  const openResource = (resource) => viewer.open(items.map(resourceInput), items.indexOf(resource))

  async function uploadMany(files) {
    let added = 0
    for (const file of files) {
      try {
        const asset = await upload.mutateAsync({ file, entityType: 'LmsLessonResource', entityId: lessonId })
        await add.mutateAsync({ fileId: asset.id })
        added += 1
      } catch { /* toast shown by the mutation */ }
    }
    if (added) toast.success(added === 1 ? 'Recurso agregado.' : `${added} recursos agregados.`)
    return null
  }

  function onDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    const from = items.findIndex((item) => item.id === active.id)
    const to = items.findIndex((item) => item.id === over.id)
    if (from >= 0 && to >= 0) reorder.mutate(moveItem(items, from, to))
  }

  async function rename(title) {
    try { await update.mutateAsync({ id: renaming.id, title }); setRenaming(null) } catch { /* toast shown */ }
  }

  async function confirmDelete() {
    try { await remove.mutateAsync(deleting.id); setDeleting(null) } catch { /* toast shown */ }
  }

  return (
    <section className="space-y-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <header className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-violet-600/10 text-violet-700 dark:text-violet-300"><FolderOpen className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0">
          <h3 className="font-semibold">Recursos descargables</h3>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Guías, plantillas o presentaciones que los alumnos abren o descargan desde la pestaña Recursos.</p>
        </div>
      </header>
      {!lessonId ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Guarda la lección para agregar recursos.</p>
      ) : query.isLoading ? (
        <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
      ) : query.isError ? (
        <ErrorState title="No se pudieron cargar los recursos" description={query.error?.message} onRetry={() => query.refetch()} />
      ) : (
        <>
          {items.length ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                <ul className="space-y-2" aria-label="Recursos de la lección">
                  {items.map((resource) => <ResourceRow key={resource.id} resource={resource} readOnly={readOnly} onOpen={openResource} onRename={setRenaming} onDelete={setDeleting} />)}
                </ul>
              </SortableContext>
            </DndContext>
          ) : <p className="text-sm text-[hsl(var(--muted-foreground))]">Esta lección aún no tiene recursos.</p>}
          {!readOnly ? (
            <FileUploader
              multiple value={null} onUploadMany={uploadMany} maxSizeMB={10}
              disabled={upload.isPending || add.isPending}
              hint="Arrastra uno o varios archivos (hasta 10 MB cada uno) o selecciónalos."
              emptyLabel="Agregar recursos"
            />
          ) : null}
        </>
      )}
      <AdvancedFileViewer {...viewer.props} />
      <RenameDialog resource={renaming} onOpenChange={(open) => { if (!open) setRenaming(null) }} onSubmit={rename} pending={update.isPending} />
      <ConfirmDialog
        open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null) }}
        icon={Trash2} title="Eliminar recurso"
        description={`Se quitará «${resourceName(deleting)}» de la lección. El archivo sigue disponible en Archivos.`}
        confirmLabel="Eliminar" loading={remove.isPending} onConfirm={confirmDelete}
      />
    </section>
  )
}
