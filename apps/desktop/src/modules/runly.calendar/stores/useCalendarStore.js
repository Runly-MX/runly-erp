import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { toLocalIso } from '../../../lib/localDate.js'

function todayDateString() {
  return toLocalIso()
}

export const useCalendarStore = create(
  persist(
    (set, get) => ({
      activeView: 'month',
      selectedDate: todayDateString(),
      selectedSlotHour: null,
      leftSidebarOpen: true,
      rightSidebarOpen: true,
      activeCalendarIds: [],
      holidayCountries: ['MX'],
      // surface: plain | relief | tinted; tint: hex used by "tinted" and accents.
      appearance: { surface: 'relief', tint: '#7C3AED', shadeWeekends: true },

      toggleHolidayCountry: (code) => set((s) => ({
        holidayCountries: s.holidayCountries.includes(code)
          ? s.holidayCountries.filter((c) => c !== code)
          : [...s.holidayCountries, code],
      })),
      setAppearance: (patch) => set((s) => ({ appearance: { ...s.appearance, ...patch } })),

      setActiveView: (view) => set({ activeView: view }),
      setSelectedDate: (date) => set({ selectedDate: date, selectedSlotHour: null }),
      focusDate: (date) => set({
        selectedDate: date,
        selectedSlotHour: null,
        rightSidebarOpen: true,
      }),
      focusTimeSlot: (date, hour) => set({
        selectedDate: date,
        selectedSlotHour: hour,
        rightSidebarOpen: true,
      }),
      clearSelectedSlot: () => set({ selectedSlotHour: null }),
      toggleLeftSidebar: () => set((s) => ({ leftSidebarOpen: !s.leftSidebarOpen })),
      toggleRightSidebar: () => set((s) => ({ rightSidebarOpen: !s.rightSidebarOpen })),

      // allIds must be passed when toggling from the "all visible" state so we can
      // remove just the clicked one instead of making it the only visible one.
      toggleCalendarFilter: (id, allIds = []) => set((s) => {
        const active = s.activeCalendarIds
        if (active.length === 0) {
          // Currently showing all — deselect the clicked one by activating all except it
          return { activeCalendarIds: allIds.filter((x) => x !== id) }
        }
        if (active.includes(id)) return { activeCalendarIds: active.filter((x) => x !== id) }
        const next = [...active, id]
        // If all are now active, collapse back to the "show all" sentinel
        if (allIds.length > 0 && next.length >= allIds.length) return { activeCalendarIds: [] }
        return { activeCalendarIds: next }
      }),
      setAllCalendarsActive: () => set({ activeCalendarIds: [] }),

      navigatePrev: () => {
        const { activeView, selectedDate } = get()
        const d = new Date(selectedDate + 'T12:00:00')
        if (activeView === 'day') d.setDate(d.getDate() - 1)
        else if (activeView === 'week') d.setDate(d.getDate() - 7)
        else if (activeView === 'month') d.setMonth(d.getMonth() - 1)
        else if (activeView === 'agenda') d.setDate(d.getDate() - 7)
        set({ selectedDate: toLocalIso(d), selectedSlotHour: null })
      },

      navigateNext: () => {
        const { activeView, selectedDate } = get()
        const d = new Date(selectedDate + 'T12:00:00')
        if (activeView === 'day') d.setDate(d.getDate() + 1)
        else if (activeView === 'week') d.setDate(d.getDate() + 7)
        else if (activeView === 'month') d.setMonth(d.getMonth() + 1)
        else if (activeView === 'agenda') d.setDate(d.getDate() + 7)
        set({ selectedDate: toLocalIso(d), selectedSlotHour: null })
      },

      navigateToday: () => set({ selectedDate: todayDateString(), selectedSlotHour: null }),
    }),
    {
      name: 'runly-calendar-prefs',
      partialize: (s) => ({
        activeView: s.activeView,
        leftSidebarOpen: s.leftSidebarOpen,
        rightSidebarOpen: s.rightSidebarOpen,
        holidayCountries: s.holidayCountries,
        appearance: s.appearance,
      }),
    }
  )
)
