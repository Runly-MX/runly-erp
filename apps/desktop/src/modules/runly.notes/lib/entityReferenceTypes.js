import { User, IdCard, Car, Package, SquareKanban, CheckSquare, CalendarDays, Landmark, Paperclip } from 'lucide-react'

// Client registry for the record types a note can link to. The keys mirror the
// API's EXTERNAL_RELATION_TARGETS (the /relation-targets search/resolve API is
// permission-aware per type), so adding a type there needs an entry here.
export const REFERENCE_TYPES = [
  { value: 'contact', label: 'Contacto', Icon: User },
  { value: 'hr_employee', label: 'Colaborador', Icon: IdCard },
  { value: 'vehicle', label: 'Vehiculo', Icon: Car },
  { value: 'inventory_item', label: 'Articulo de inventario', Icon: Package },
  { value: 'project', label: 'Proyecto', Icon: SquareKanban },
  { value: 'task', label: 'Tarea', Icon: CheckSquare },
  { value: 'calendar_event', label: 'Evento', Icon: CalendarDays },
  { value: 'ledger_account', label: 'Cuenta', Icon: Landmark },
  { value: 'file', label: 'Archivo', Icon: Paperclip },
]

export function referenceTypeOf(value) {
  return REFERENCE_TYPES.find((type) => type.value === value) ?? null
}
