import { SwitchField } from '@runly/ui'

// The two optional supplier capabilities; only meaningful for the Editor role.
export function GuestCapabilityFields({ canCreateModels, canImport, onChange }) {
  return (
    <div className="space-y-3 rounded-md border border-[hsl(var(--border))] p-3">
      <SwitchField label="Puede crear modelos y catálogos" checked={canCreateModels} onChange={(v) => onChange({ canCreateModels: v })}
        description="Podrá agregar modelos, tipos, marcas, ubicaciones y condiciones que aún no existan." />
      <SwitchField label="Puede importar desde Excel" checked={canImport} onChange={(v) => onChange({ canImport: v })}
        description="Podrá cargar varios items a la vez desde un archivo CSV o Excel." />
    </div>
  )
}
