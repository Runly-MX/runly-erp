import { useState } from 'react'
import {
  Button, ConfirmDialog, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, EmptyState, ErrorState, Skeleton,
} from '@runly/ui'
import { Megaphone, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAnnouncements, useDeleteAnnouncement, useSaveAnnouncement } from '../../hooks/useLmsSocial.js'
import { AnnouncementCard } from './AnnouncementsList.jsx'
import { AnnouncementDialog } from './AnnouncementDialog.jsx'

// Course editor "Anuncios" tab: list, create/edit dialog and delete confirmation.
export function AnnouncementsTab({ courseId, readOnly = false }) {
  const query = useAnnouncements(courseId)
  const save = useSaveAnnouncement(), remove = useDeleteAnnouncement()
  const [editing, setEditing] = useState(null) // null closed, {} new, announcement = edit
  const [deleting, setDeleting] = useState(null)
  const items = query.data ?? []

  async function submit(data) {
    try {
      await save.mutateAsync({ id: editing?.id, courseId, ...data })
      setEditing(null)
    } catch { /* toast shown */ }
  }

  async function doDelete() {
    try {
      await remove.mutateAsync(deleting.id)
      setDeleting(null)
    } catch { /* toast shown */ }
  }

  const menu = (item) => (readOnly ? null : (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Acciones del anuncio"><MoreHorizontal /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setEditing(item)}><Pencil />Editar</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setDeleting(item)} className="text-[hsl(var(--destructive))]"><Trash2 />Eliminar</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ))

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Avisos para todos los alumnos del curso. Se muestran del más reciente al más antiguo.</p>
        {readOnly ? null : <Button onClick={() => setEditing({})} className="shrink-0"><Plus />Nuevo anuncio</Button>}
      </div>
      {query.isLoading ? (
        <div className="space-y-3"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-24 rounded-xl" /></div>
      ) : query.isError ? (
        <ErrorState title="No se pudieron cargar los anuncios" description={query.error?.message} onRetry={() => query.refetch()} />
      ) : !items.length ? (
        <EmptyState icon={Megaphone} title="Sin anuncios" description="Publica un aviso cuando agregues contenido, cambies una fecha o quieras recordar algo a tus alumnos." />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => <li key={item.id}><AnnouncementCard announcement={item} actions={menu(item)} /></li>)}
        </ul>
      )}
      <AnnouncementDialog
        open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null) }}
        announcement={editing?.id ? editing : null} onSubmit={submit} pending={save.isPending}
      />
      <ConfirmDialog
        open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null) }}
        icon={Trash2}
        title="Eliminar anuncio"
        description={`«${deleting?.title ?? ''}» dejará de mostrarse a los alumnos.`}
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onConfirm={doDelete}
      />
    </div>
  )
}
