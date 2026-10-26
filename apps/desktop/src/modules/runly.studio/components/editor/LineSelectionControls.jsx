import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger, NumberStepper, ToolButton } from '@runly/ui'
import { lineCapPath } from '../../../../../../shared/studio/line-caps.js'
import { LINE_CAP_OPTIONS, LINE_DASHES } from '../../lib/element-library.js'
import { ColorPopover } from './StudioColorPicker.jsx'

function DashIcon({ dash }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={dash === 'dashed' ? '5 3.5' : dash === 'dotted' ? '0.1 4.5' : undefined} />
    </svg>
  )
}

// A short line with the cap drawn by the same geometry as the renderer.
export function CapIcon({ cap, end = 'end' }) {
  const points = [[4, 12], [20, 12]], head = lineCapPath(points, end, cap, 2)
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 overflow-visible" aria-hidden>
      <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="2" />
      {head ? <path d={head.d} fill={head.filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={head.filled ? 0 : 2} strokeLinejoin="round" /> : null}
    </svg>
  )
}

const capOf = (selection, end) => selection[`${end}Cap`] ?? (selection[`${end}Arrow`] ? 'arrow' : 'none')

function CapMenu({ end, value, disabled, onPatch }) {
  const label = end === 'start' ? 'Extremo inicial' : 'Extremo final'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><ToolButton label={`${label}: ${LINE_CAP_OPTIONS.find(option => option.value === value)?.label}`} side="bottom" disabled={disabled} active={value !== 'none'}><CapIcon cap={value} end={end} /></ToolButton></DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="min-w-48">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={cap => onPatch({ [`${end}Cap`]: cap })}>
          {LINE_CAP_OPTIONS.map(option => <DropdownMenuRadioItem key={option.value} value={option.value} className="gap-2.5"><CapIcon cap={option.value} end={end} />{option.label}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Selected line: color, stroke weight, dash pattern and each end's cap (v5 startCap/endCap).
export function LineSelectionControls({ selection, disabled, onPatch }) {
  return (
    <div role="group" aria-label="Formato de línea" className="flex flex-wrap items-center gap-1 max-sm:flex-nowrap max-sm:[&>*]:shrink-0">
      <ColorPopover label="Color de la línea" value={selection.fill} disabled={disabled} onChange={fill => onPatch({ fill })} />
      <NumberStepper label="Grosor de la línea" size="sm" min={1} max={64} step={1} value={Math.round(selection.strokeWidth ?? 2)} disabled={disabled} onChange={strokeWidth => onPatch({ strokeWidth })} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild><ToolButton label="Trazo" side="bottom" disabled={disabled}><DashIcon dash={selection.dash} /></ToolButton></DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="min-w-44">
          <DropdownMenuRadioGroup value={selection.dash ?? 'solid'} onValueChange={dash => onPatch({ dash })}>
            {LINE_DASHES.map(option => <DropdownMenuRadioItem key={option.value} value={option.value} className="gap-2.5"><DashIcon dash={option.value} />{option.label}</DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <CapMenu end="start" value={capOf(selection, 'start')} disabled={disabled} onPatch={onPatch} />
      <CapMenu end="end" value={capOf(selection, 'end')} disabled={disabled} onPatch={onPatch} />
    </div>
  )
}
