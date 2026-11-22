import { Button } from './Button.jsx'
import { Tooltip, TooltipContent, TooltipTrigger } from './Tooltip.jsx'
import { cn } from '../lib/utils.js'

// Icon-only editor tool: ghost icon button with a tooltip that shows the
// label and an optional keyboard shortcut. `active` paints the brand fill and
// sets aria-pressed (tool pickers, panel toggles); tone="soft" tints it instead
// (dense editors where several toggles may be on at once).
export function ToolButton({ label, shortcut, active, tone = 'solid', className, side = 'top', children, ...props }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={shortcut ? `${label} (${shortcut})` : label}
          aria-pressed={active}
          className={cn(
            'rounded-lg text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
            active && (tone === 'soft'
              ? 'bg-[color-mix(in_srgb,var(--brand-primary)_14%,transparent)] text-[var(--brand-primary-computed)] hover:bg-[color-mix(in_srgb,var(--brand-primary)_20%,transparent)] hover:text-[var(--brand-primary-computed)]'
              : 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'),
            className,
          )}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side} className="flex items-center gap-2">
        {label}
        {shortcut ? <kbd className="rounded border border-[hsl(var(--border))] px-1 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{shortcut}</kbd> : null}
      </TooltipContent>
    </Tooltip>
  )
}
