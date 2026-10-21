import { useParams } from 'react-router-dom'
import { Skeleton } from '@runly/ui'
import { GuestSessionProvider, useGuestSession } from '../hooks/useInventoryGuest.js'
import { GuestBrandBar, GuestCodeForm, GuestErrorPage } from '../components/guest/GuestPortalParts.jsx'
import { GuestInventory } from '../components/guest/GuestInventory.jsx'

function PortalGate() {
  const { status, error, busy, submitCode } = useGuestSession()
  if (status === 'error') return <GuestErrorPage error={error} onReenter={() => submitCode()} />
  if (status === 'needs-code') return <GuestCodeForm busy={busy} error={error} onSubmit={submitCode} />
  if (status === 'ready') return <GuestInventory />
  return (
    <div className="min-h-dvh">
      <GuestBrandBar loading />
      <div className="mx-auto max-w-3xl space-y-3 px-4 py-8"><Skeleton className="h-8 w-48" /><Skeleton className="h-24 w-full" /></div>
    </div>
  )
}

// Supplier portal: no login, no app shell. Opened from the invitation email at
// /app/p/inventory/:token (rendered inside PublicShell). The link is exchanged for
// a short guest session that only reaches the folders the supplier was invited to.
export default function PublicInventoryPortalScreen() {
  const { token } = useParams()
  return (
    <GuestSessionProvider key={token} token={token}>
      <PortalGate />
    </GuestSessionProvider>
  )
}
