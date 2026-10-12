import { Label } from '@runly/ui'

// Label + body + hint/error wrapper for custom controls (chips, stepper) that have no @runly/ui field.
export function FieldShell({ label, required, hint, error, children }) {
  return (
    <div className="space-y-1.5">
      {label ? <Label>{label}{required ? <span className="ml-0.5 text-destructive">*</span> : null}</Label> : null}
      {children}
      {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : hint ? <p className="text-xs text-[hsl(var(--muted-foreground))]">{hint}</p> : null}
    </div>
  )
}
