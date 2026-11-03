import { Button } from '@runly/ui'
import { reasonText } from '../lib/capabilities.js'

// A button gated by a capability ({ allowed, reason }). When not allowed it is
// disabled and the reason stays readable (title + screen-reader text), so the
// user always learns why. The server still enforces every command.
export function CapabilityButton({ capability, children, disabledReason, ...props }) {
  const allowed = capability ? capability.allowed : true
  const reason = !allowed ? (disabledReason ?? reasonText(capability?.reason)) : ''
  return (
    <span title={reason || undefined} className="inline-flex">
      <Button {...props} disabled={props.disabled || !allowed} aria-describedby={undefined}>
        {children}
      </Button>
      {reason ? <span className="sr-only">{reason}</span> : null}
    </span>
  )
}
