import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '../../../auth/AuthProvider'
import { runly } from '../../../lib/runly'

function useToken() {
  const { session } = useAuth()
  return session?.access_token
}

// Area changes also change which items are visible/where they live.
function useInvalidate() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['inventory'] })
}

export function useInventoryAreas() {
  const token = useToken()
  return useQuery({
    queryKey: ['inventory', 'areas', 'list'],
    queryFn: () => runly.inventory.listAreas(token).then((res) => res?.data ?? res ?? []),
    enabled: Boolean(token),
    staleTime: 60 * 1000,
  })
}

export function useInventoryAreasSettings() {
  const token = useToken()
  return useQuery({
    queryKey: ['inventory', 'areas', 'settings'],
    queryFn: () => runly.inventory.getAreasSettings(token).then((res) => res?.data ?? res),
    enabled: Boolean(token),
    staleTime: 60 * 1000,
  })
}

export function useSetInventoryAreasSettings() {
  const token = useToken()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (patch) => runly.inventory.setAreasSettings(patch, token).then((res) => res?.data ?? res),
    onSuccess: invalidate,
    onError: (err) => toast.error(err?.message ?? 'No se pudo guardar el ajuste'),
  })
}

// { id?, name, parentId } -> create when no id, update otherwise.
export function useSaveInventoryArea() {
  const token = useToken()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...data }) => (id
      ? runly.inventory.updateArea(id, data, token)
      : runly.inventory.createArea(data, token)).then((res) => res?.data ?? res),
    onSuccess: invalidate,
  })
}

export function useDeleteInventoryArea() {
  const token = useToken()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id) => runly.inventory.deleteArea(id, token),
    onSuccess: invalidate,
  })
}

export function useInventoryAreaMembers(areaId) {
  const token = useToken()
  return useQuery({
    queryKey: ['inventory', 'areas', 'members', areaId],
    queryFn: () => runly.inventory.listAreaMembers(areaId, token).then((res) => res?.data ?? res ?? []),
    enabled: Boolean(token) && Boolean(areaId),
  })
}

export function useSetInventoryAreaMember(areaId) {
  const token = useToken()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ userId, role }) => runly.inventory.setAreaMember(areaId, userId, role, token),
    onSuccess: invalidate,
  })
}

export function useRemoveInventoryAreaMember(areaId) {
  const token = useToken()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (userId) => runly.inventory.removeAreaMember(areaId, userId, token),
    onSuccess: invalidate,
  })
}

export function useMoveInventoryItems() {
  const token = useToken()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ itemIds, areaId }) => runly.inventory.moveItems(itemIds, areaId, token).then((res) => res?.data ?? res),
    onSuccess: invalidate,
  })
}

// Supplier (guest) invitations of one area.
export function useInventoryAreaGuests(areaId) {
  const token = useToken()
  return useQuery({
    queryKey: ['inventory', 'areas', 'guests', areaId],
    queryFn: () => runly.inventory.listAreaGuests(areaId, token).then((res) => res?.data ?? res ?? []),
    enabled: Boolean(token) && Boolean(areaId),
  })
}

// Mutations resolve to the API payload ({ guest, link, code, sent, mailError } for invite/resend).
export function useInviteInventoryAreaGuest(areaId) {
  const token = useToken()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (data) => runly.inventory.inviteAreaGuest(areaId, data, token).then((res) => res?.data ?? res),
    onSuccess: invalidate,
  })
}

export function useUpdateInventoryAreaGuest(areaId) {
  const token = useToken()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ guestId, ...data }) => runly.inventory.updateAreaGuest(areaId, guestId, data, token).then((res) => res?.data ?? res),
    onSuccess: invalidate,
  })
}

export function useResendInventoryGuest() {
  const token = useToken()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ guestId, requireCode }) => runly.inventory.resendGuestInvite(guestId, requireCode === undefined ? {} : { requireCode }, token).then((res) => res?.data ?? res),
    onSuccess: invalidate,
  })
}

export function useRevokeInventoryGuest() {
  const token = useToken()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (guestId) => runly.inventory.revokeGuest(guestId, token),
    onSuccess: invalidate,
  })
}

export function useRemoveInventoryAreaGuest(areaId) {
  const token = useToken()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (guestId) => runly.inventory.removeAreaGuest(areaId, guestId, token),
    onSuccess: invalidate,
  })
}
