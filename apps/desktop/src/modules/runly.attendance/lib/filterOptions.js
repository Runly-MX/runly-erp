import {
  ArrowLeftRight, CircleCheck, CircleOff, CreditCard, Hash, HardHat, Hourglass, KeyRound, Link2, LogIn, LogOut, Pencil,
  ScanLine, ShieldOff, Smartphone, Unlink, UserRound, Users, Wifi, WifiOff,
} from 'lucide-react'
import { DIRECTION_LABELS, KIND_LABELS, METHOD_LABELS } from './attendanceLabels.js'

// Filter option lists (with icons) shared by the attendance screens' Filtros menu.
const withIcons = (labels, icons) => Object.entries(labels).map(([value, label]) => ({ value, label, icon: icons[value] }))

export const KIND_FILTER_OPTIONS = withIcons(KIND_LABELS, { internal: Users, contractor: HardHat, visitor: UserRound })
export const DIRECTION_FILTER_OPTIONS = withIcons(DIRECTION_LABELS, { in: LogIn, out: LogOut })
export const METHOD_FILTER_OPTIONS = withIcons(METHOD_LABELS, {
  card: CreditCard, pin: KeyRound, code: Hash, phone_qr: Smartphone, phone_scan: ScanLine, manual: Pencil,
})
export const PERSON_STATUS_OPTIONS = [
  { value: 'active', label: 'Activo', icon: CircleCheck },
  { value: 'inactive', label: 'Inactivo', icon: CircleOff },
]
export const HR_FILTER_OPTIONS = [
  { value: 'yes', label: 'Vinculada a RH', icon: Link2 },
  { value: 'no', label: 'Sin vínculo con RH', icon: Unlink },
]
export const KIOSK_STATUS_OPTIONS = [
  { value: 'online', label: 'En línea', icon: Wifi },
  { value: 'offline', label: 'Sin conexión', icon: WifiOff },
  { value: 'pending', label: 'Pendiente de aprobar', icon: Hourglass },
  { value: 'unpaired', label: 'Sin emparejar', icon: Unlink },
  { value: 'revoked', label: 'Revocado', icon: ShieldOff },
]
export const KIOSK_MODE_ICONS = { both: ArrowLeftRight, in: LogIn, out: LogOut }
