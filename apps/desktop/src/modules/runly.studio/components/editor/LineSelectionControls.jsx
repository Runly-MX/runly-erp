import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger, NumberStepper, ToolButton } from '@runly/ui'
import { MoveRight } from 'lucide-react'
import { LINE_DASHES, LINE_ENDS } from '../../lib/element-library.js'
import { ColorPopover } from './StudioColorPicker.jsx'

function DashIcon({ dash }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={dash === 'dashed' ? '5 3.5' : dash === 'dotted' ? '0.1 4.5' : undefined} />
    </svg>
  )
}

// Selected line: color, stroke weight, dash pattern and arrow ends.
export function LineSelectionControls({ selection, disabled, onPatch }) {
  const ends = selection.startArrow && selection.endArrow ? 'double' : selection.endArrow ? 'arrow' : selection.startArrow ? 'start' : 'none'
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild><ToolButton label="Extremos" side="bottom" disabled={disabled} active={ends !== 'none'}><MoveRight /></ToolButton></DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="min-w-44">
          <DropdownMenuRadioGroup value={ends} onValueChange={value => { const option = LINE_ENDS.find(item => item.value === value); onPatch({ startArrow: option.startArrow, endArrow: option.endArrow }) }}>
            {LINE_ENDS.map(option => <DropdownMenuRadioItem key={option.value} value={option.value}>{option.label}</DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
