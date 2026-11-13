import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Users, UserPlus, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  EmptyState,
  PersonAvatar,
  PersonOption,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  personName,
} from '@runly/ui'
import { NoteIcon } from '../noteIcons.jsx'
import { useNoteShares, useShareNote, useUpdateNoteShare, useRevokeNoteShare } from '../hooks/useNoteShares.js'
import { useFolderShares, useShareFolder, useUpdateFolderShare, useRevokeFolderShare } from '../hooks/useNoteFolders.js'
import { UserListSkeleton } from '../../runly.chat/components/UserPicker.jsx'
import { runly } from '../../../lib/runly'
import { useAuth } from '../../../auth/AuthProvider'
import { ResourceInvitationControl } from '../../../company/ResourceInvitationControl.jsx'

const PERMISSION_OPTIONS = [
  { value: 'read', label: 'Solo lectura' },
  { value: 'edit', label: 'Puede editar' },
]

function PermissionSelect({ value, onChange, disabled, label }) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label={label} className="h-9 w-36 shrink-0 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PERMISSION_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
      {children}
    </p>
  )
}

// Shares a note, or a whole folder when `folder` is passed (its notes, present
// and future, inherit the access). Pick several people, one permission, send.
export function NoteShareModal({ note, noteId, folder, open, onOpenChange }) {
  const id = folder?.id ?? note?.id ?? noteId
  const { session } = useAuth()
  const token = session?.access_token
  const noteShares = useNoteShares(folder ? null : id)
  const folderShares = useFolderShares(folder?.id)
  const { data, isLoading: sharesLoading } = folder ? folderShares : noteShares
  const shareNoteM = useShareNote()
  const updateNoteShareM = useUpdateNoteShare()
  const revokeNoteShareM = useRevokeNoteShare()
  const shareFolderM = useShareFolder()
  const updateFolderShareM = useUpdateFolderShare()
  const revokeFolderShareM = useRevokeFolderShare()
  const shareM = folder ? shareFolderM : shareNoteM
  const updateShare = folder ? updateFolderShareM : updateNoteShareM
  const revokeShare = folder ? revokeFolderShareM : revokeNoteShareM
  // Mutations take { noteId } or { folderId } depending on the target.
  const target = folder ? { folderId: id } : { noteId: id }

  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [selected, setSelected] = useState([])
  const [permission, setPermission] = useState('read')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  // Picker is limited to users with notes-module access (GET /notes/shareable-users).
  const candidates = useQuery({
    queryKey: ['notes', 'shareable-users', debounced],
    queryFn: () => runly.notes.listShareableUsers(debounced || null, token),
    enabled: Boolean(token) && open,
    staleTime: 30_000,
  })

  const shares = data?.shares ?? []
  const sharedIds = useMemo(() => new Set(shares.map((s) => s.shared_with_user_id)), [shares])
  const options = (candidates.data?.users ?? []).filter((u) => !sharedIds.has(u.id))

  function toggle(u) {
    setSelected((prev) => (prev.some((s) => s.id === u.id) ? prev.filter((s) => s.id !== u.id) : [...prev, u]))
  }

  function close() {
    if (sending) return
    setSelected([])
    setSearch('')
    setPermission('read')
    onOpenChange(false)
  }

  // Sequential so a partial failure keeps the invites that did go through.
  async function handleSend() {
    if (!selected.length) return
    setSending(true)
    const failed = []
    for (const u of selected) {
      try {
        await shareM.mutateAsync({ ...target, targetUserId: u.id, permission })
      } catch {
        failed.push(u)
      }
    }
    setSending(false)
    if (failed.length) {
      setSelected(failed)
      toast.error(failed.length === selected.length
        ? 'No se pudo compartir.'
        : `No se pudo compartir con ${failed.length} de ${selected.length} personas. El resto si.`)
      return
    }
    toast.success(selected.length === 1 ? 'Compartido con 1 persona.' : `Compartido con ${selected.length} personas.`)
    setSelected([])
    setSearch('')
  }

  const title = folder ? 'Compartir carpeta' : 'Compartir nota'
  const subject = folder?.name ?? note?.title

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent scrollable size="lg" mobileVariant="center" className="max-h-[85dvh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {!folder && note?.icon
              ? <NoteIcon name={note.icon} size={16} className="shrink-0 text-amber-500" />
              : <Users className="h-4 w-4 shrink-0 text-amber-500" />}
            {title}
          </DialogTitle>
          {subject && <DialogDescription className="truncate">{subject}</DialogDescription>}
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-1 py-1">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            {folder
              ? 'Las notas de esta carpeta, actuales y futuras, quedan compartidas con estas personas.'
              : note?.child_count > 0 ? 'Las subpaginas heredan este acceso.' : 'Elige una o varias personas y su permiso.'}
          </p>

          <div className="space-y-3">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClear={() => setSearch('')}
              placeholder="Buscar por nombre o correo..."
              autoFocus
            />

            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selected.map((u) => (
                  <span key={u.id} className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--muted))] py-1 pl-1 pr-2 text-xs">
                    <PersonAvatar name={personName(u)} src={u.avatarUrl ?? null} size="sm" />
                    <span className="max-w-36 truncate">{personName(u)}</span>
                    <button
                      type="button"
                      onClick={() => toggle(u)}
                      aria-label={`Quitar a ${personName(u)}`}
                      className="rounded-full p-0.5 hover:bg-[hsl(var(--border))]"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="max-h-56 overflow-y-auto rounded-lg border p-1">
              {candidates.isError ? (
                <p role="alert" className="px-3 py-4 text-sm text-destructive">No se pudieron cargar las personas.</p>
              ) : candidates.isLoading ? (
                <UserListSkeleton />
              ) : options.length === 0 ? (
                <p className="px-3 py-4 text-sm text-[hsl(var(--muted-foreground))]">
                  {debounced ? 'Sin resultados' : 'Sin personas disponibles'}
                </p>
              ) : (
                options.map((u) => (
                  <PersonOption
                    key={u.id}
                    user={u}
                    selected={selected.some((s) => s.id === u.id)}
                    onSelect={toggle}
                    secondary={u.email}
                  />
                ))
              )}
            </div>
          </div>

          <div className="space-y-2 border-t pt-4">
            <SectionLabel>Personas con acceso</SectionLabel>
            {sharesLoading ? (
              <div className="flex items-center gap-2 py-2 text-sm text-[hsl(var(--muted-foreground))]">
                <Loader2 className="h-4 w-4 animate-spin text-amber-500" /> Cargando...
              </div>
            ) : shares.length === 0 ? (
              <EmptyState
                variant="compact"
                title={folder ? 'Esta carpeta no esta compartida' : 'Solo tu tienes acceso a esta nota'}
              />
            ) : (
              <ul className="space-y-1">
                {shares.map((share) => {
                  const user = { displayName: share.display_name, email: share.user_email, avatarUrl: share.avatarUrl, subtitle: share.subtitle }
                  const name = personName(user) || '?'
                  const busy = revokeShare.isPending || updateShare.isPending
                  return (
                    <li key={share.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-2 py-2">
                      <PersonOption user={user} secondary={share.user_email} className="min-w-36 flex-1 px-0 py-0" />
                      <div className="ml-auto flex items-center gap-2">
                        <PermissionSelect
                          value={share.permission}
                          disabled={busy}
                          label={`Permiso de ${name}`}
                          onChange={(val) => updateShare.mutate({ ...target, shareId: share.id, permission: val })}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          aria-label={`Retirar acceso de ${name}`}
                          onClick={() => revokeShare.mutate({ ...target, shareId: share.id })}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {!folder && <ResourceInvitationControl resourceType="note" resourceId={id} />}
        </div>

        <DialogFooter>
          <div className="mr-auto flex items-center gap-2">
            <span className="text-xs text-[hsl(var(--muted-foreground))]">Permiso</span>
            <PermissionSelect value={permission} onChange={setPermission} disabled={sending} label="Permiso para las personas elegidas" />
          </div>
          <Button type="button" variant="outline" onClick={close} disabled={sending}>Cerrar</Button>
          <Button type="button" onClick={handleSend} disabled={!selected.length || sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {sending ? 'Compartiendo...' : `Compartir${selected.length ? ` (${selected.length})` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
