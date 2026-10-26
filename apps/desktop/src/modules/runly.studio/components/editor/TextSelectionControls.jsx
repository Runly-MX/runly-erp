import { NumberStepper, Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@runly/ui'
import { StudioFontPicker } from '../StudioFontPicker.jsx'
import { ColorPopover } from './StudioColorPicker.jsx'

// Only canonical text properties are editable. Unavailable variants cannot be selected.
export function TextSelectionControls({ selection, disabled, onPatch }) {
  return <div role="group" aria-label="Formato de texto" className="flex min-w-0 flex-wrap items-center gap-1">
    <StudioFontPicker compact value={selection.fontFamily} disabled={disabled} onChange={fontFamily => onPatch({ fontFamily })} />
    <Select value="regular" disabled={disabled}>
      <SelectTrigger aria-label="Variante tipográfica" className="h-10 w-28 shrink-0 border-transparent shadow-none sm:h-9"><SelectValue>Regular</SelectValue></SelectTrigger>
      <SelectContent className="motion-reduce:animate-none">
        <SelectGroup>
          <SelectLabel>Variantes disponibles</SelectLabel>
          <SelectItem value="regular">Regular · 400</SelectItem>
          <SelectItem value="bold" disabled>Negrita · No disponible</SelectItem>
          <SelectItem value="italic" disabled>Cursiva · No disponible</SelectItem>
          <SelectItem value="bold-italic" disabled>Negrita cursiva · No disponible</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
    <NumberStepper label="Tamaño de letra" size="sm" min={8} max={500} step={2} value={Math.round(selection.fontSize)} disabled={disabled} onChange={fontSize => onPatch({ fontSize })} />
    <ColorPopover label="Color del texto" value={selection.fill} disabled={disabled} onChange={fill => onPatch({ fill })} />
  </div>
}
