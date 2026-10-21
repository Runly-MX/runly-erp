import { useGuestMe, useGuestSession, useGuestItem } from '../../hooks/useInventoryGuest.js'
import { useGuestPortalView } from '../../hooks/useGuestPortalView.js'
import { areaPathLabel } from '../../lib/area-tree.js'
import { GuestItemDetailPage } from './GuestItemDetailPage.jsx'
import { GuestItemFormPage } from './GuestItemFormPage.jsx'
import { GuestListView } from './GuestListView.jsx'
import { GuestBrandBar, GuestPortalRoot } from './GuestPortalParts.jsx'
import { Skeleton } from '@runly/ui'

function EditRoute({ id, go }) {
  const item = useGuestItem(id)
  if (item.isLoading) return <div className="space-y-3"><Skeleton className="h-10 w-48" /><Skeleton className="h-64 w-full" /></div>
  // Locked items (baja propuesta / dada de baja) and read-only folders go back to the detail page.
  if (!item.data || !item.data.canWrite || ['deregistration_proposed', 'deregistered'].includes(item.data.adminStatus)) {
    return <GuestItemDetailPage itemId={id} onBack={() => go('list')} onEdit={() => {}} />
  }
  return <GuestItemFormPage item={item.data} onBack={() => go('detail', id)} onSaved={(savedId) => go('detail', savedId)} />
}

// Supplier portal shell: company identity bar + hash-routed pages (list, detail, new, edit).
export function GuestInventory() {
  const { session, logout } = useGuestSession()
  const me = useGuestMe()
  const { view, id, go } = useGuestPortalView()
  const company = me.data?.company ?? session?.company
  const guestName = me.data?.guest?.name ?? session?.guest?.name
  const detailItem = useGuestItem(view === 'detail' ? id : null)
  const areaName = areaPathLabel(me.data?.areas ?? [], detailItem.data?.areaId)

  return (
    <GuestPortalRoot primaryColor={company?.primaryColor}>
      <GuestBrandBar company={company} guestName={guestName} onLogout={logout} />
      <div className="mx-auto max-w-7xl px-4 py-5 md:px-8">
        {view === 'new' ? <GuestItemFormPage onBack={() => go('list')} onSaved={(savedId) => go('detail', savedId)} />
          : view === 'edit' ? <EditRoute id={id} go={go} />
            : view === 'detail' ? <GuestItemDetailPage itemId={id} areaName={areaName} onBack={() => go('list')} onEdit={(itemId) => go('edit', itemId)} />
              : <GuestListView me={me} onOpen={(itemId) => go('detail', itemId)} onEdit={(itemId) => go('edit', itemId)} onCreate={() => go('new')} />}
      </div>
    </GuestPortalRoot>
  )
}
