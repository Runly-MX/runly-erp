import { useState } from 'react'
import { Button, ConfirmDialog, EmptyState, ErrorState, PersonAvatar, SelectField, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Skeleton, UserSearchModal } from '@runly/ui'
import { UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../../../auth/AuthProvider'
import { useActiveCompany } from '../../../../company/ActiveCompanyProvider'
import { getApiUrl } from '../../../../lib/runtimeConfig.js'
import { useInventoryAreaMembers, useRemoveInventoryAreaMember, useSetInventoryAreaMember } from '../../hooks/useInventoryAreas.js'

export const AREA_ROLE_OPTIONS = [
  { value: 'viewer', label: 'Lector: solo ver' },
  { value: 'editor', label: 'Editor: ver y editar items' },
  { value: 'manager', label: 'Responsable: administra miembros' },
]

// Members of one area. Membership also grants access to every sub-folder.
export function AreaMembersSheet({ area, open, onOpenChange }) {
  const { session } = useAuth()
  const { activeCompanyId } = useActiveCompany()
  const members = useInventoryAreaMembers(open ? area?.id : null)
  const setMember = useSetInventoryAreaMember(area?.id)
  const removeMember = useRemoveInventoryAreaMember(area?.id)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState(null)
  const rows = members.data ?? []

  async function changeRole(userId, role) {
    try { await setMember.mutateAsync({ userId, role }) } catch (err) { toast.error(err?.message ?? 'No se pudo cambiar el rol') }
  }

  async function handleAdd(userId, role) {
    try {
      await setMember.mutateAsync({ userId, role })
      toast.success('Miembro agregado')
    } catch (err) { toast.error(err?.message ?? 'No se pudo agregar al miembro') }
  }

  async function handleRemove() {
    try {
      await removeMember.mutateAsync(removeTarget.userId)
      toast.success('Miembro quitado')
    } catch (err) { toast.error(err?.message ?? 'No se pudo quitar al miembro') }
    setRemoveTarget(null)
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
          <SheetHeader className="shrink-0">
            <SheetTitle>Miembros de {area?.name}</SheetTitle>
            <SheetDescription>Ven los items de esta área y de sus subcarpetas, según su rol.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain py-4">
            {members.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : members.isError ? (
              <ErrorState title="No se pudieron cargar los miembros" description={members.error?.message} onRetry={() => members.refetch()} />
            ) : rows.length === 0 ? (
              <EmptyState icon={Users} title="Esta área no tiene miembros" description="Agrega usuarios para que puedan ver sus items." />
            ) : rows.map((member) => (
              <div key={member.userId} className="flex items-center gap-3 rounded-md border border-[hsl(var(--border))] p-3">
                <PersonAvatar name={member.user?.displayName} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{member.user?.displayName ?? 'Usuario'}</p>
                  <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{member.user?.email}</p>
                </div>
                <div className="w-44 shrink-0">
                  <SelectField aria-label="Rol" value={member.role} options={AREA_ROLE_OPTIONS} onValueChange={(role) => changeRole(member.userId, role)} />
                </div>
                <Button variant="ghost" size="sm" onClick={() => setRemoveTarget(member)}>Quitar</Button>
              </div>
            ))}
          </div>
          <div className="shrink-0 border-t border-[hsl(var(--border))] pt-4">
            <Button className="w-full" onClick={() => setPickerOpen(true)}><UserPlus className="mr-2 h-4 w-4" />Agregar miembro</Button>
          </div>
        </SheetContent>
      </Sheet>
      <UserSearchModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={handleAdd}
        roles={AREA_ROLE_OPTIONS}
        excludeIds={rows.map((m) => m.userId)}
        apiBase={getApiUrl()}
        token={session?.access_token}
        companyId={activeCompanyId}
      />
      <ConfirmDialog
        open={Boolean(removeTarget)}
        onOpenChange={(v) => { if (!v) setRemoveTarget(null) }}
        title="Quitar miembro"
        description="Dejará de ver los items de esta área y de sus subcarpetas, salvo que pertenezca a otra que los incluya."
        detail={removeTarget?.user?.displayName}
        confirmLabel="Quitar"
        loading={removeMember.isPending}
        onConfirm={handleRemove}
      />
    </>
  )
}
