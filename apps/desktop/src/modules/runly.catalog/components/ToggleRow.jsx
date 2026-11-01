// apps/desktop/src/modules/runly.catalog/components/ToggleRow.jsx
import { Switch } from '@runly/ui'

// Label + description + switch. The checked track uses the module accent
// that keeps 3:1 against the surface (the official color may not).
export default function ToggleRow({ id, label, description, checked, onChange, disabled }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-[hsl(var(--foreground))]">{label}</label>
        {description && <p className="text-xs text-[hsl(var(--muted-foreground))]">{description}</p>}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="mt-0.5 shrink-0 data-[state=checked]:bg-(--brand-primary-text) dark:data-[state=checked]:bg-(--brand-primary-on-dark)"
      />
    </div>
  )
}
