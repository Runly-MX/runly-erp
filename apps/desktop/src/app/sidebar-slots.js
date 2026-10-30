import { NotesSidebarSlot } from '../modules/runly.notes/components/NotesSidebarSlot.jsx'
import { PurchasesSidebarSlot } from '../modules/runly.purchases/components/NewPurchaseButton.jsx'

// Maps module key → sidebar slot component.
// The slot is rendered below the nav items in ModuleSidebar (hidden when
// collapsed), or above them when the component sets `placement = 'top'`.
// Each component must work standalone: own data fetching, own navigation.
export const MODULE_SIDEBAR_SLOTS = {
  'runly.notes': NotesSidebarSlot,
  'runly.purchases': PurchasesSidebarSlot,
}
