import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { RoomReservationDialog } from '../../runly.bookings/components/RoomReservationDialog.jsx'
import { useRooms } from '../../runly.bookings/hooks/useBookings.js'

// "Reservar sala" inside Calendar: the reservation goes through the Booking Engine
// (Reservaciones); Calendar only receives the projected event afterwards, so a plain
// calendar event never occupies a room. Shown when the person may reserve some room.
export function useCalendarRoomReservation(day) {
  const { userProfile } = useAuth()
  const perms = userProfile?.permissions ?? []
  const allowed = Boolean(userProfile?.isAdmin || perms.includes('bookings.reserve') || perms.includes('bookings.access'))
  const rooms = useRooms({ enabled: allowed })
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const available = allowed && (rooms.data ?? []).some((s) => s.resources.length)
  // The projection runs right after the commit; refresh the calendar once it landed.
  const refresh = () => [800, 2500].forEach((ms) => setTimeout(() => client.invalidateQueries({ queryKey: ['calendar', 'events'] }), ms))
  const start = day ? new Date(day) : null
  if (start) start.setHours(Math.max(new Date().getHours() + 1, 9), 0, 0, 0)
  const dialog = available ? (
    <RoomReservationDialog open={open} onOpenChange={setOpen} rooms={rooms.data}
      initial={start && start.getTime() > Date.now() ? { startsAt: start, endsAt: new Date(start.getTime() + 3600000) } : null} onDone={refresh} />
  ) : null
  return { available, open: () => setOpen(true), dialog }
}
