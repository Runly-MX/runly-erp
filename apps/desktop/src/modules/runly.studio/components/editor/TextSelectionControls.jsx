import { useEffect, useRef, useState } from 'react'
import { NumberStepper, Popover, PopoverContent, PopoverTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SliderRow, Textarea, ToolButton } from '@runly/ui'
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Strikethrough, TextCursorInput, Underline } from 'lucide-react'
import { STUDIO_FONT_VARIANTS, STUDIO_FONT_VARIANT_LABELS as VARIANT_LABELS, studioFontStyle } from '../../../../../../shared/studio/fonts.js'
import { StudioFontPicker } from '../StudioFontPicker.jsx'
import { ColorPopover } from './StudioColorPicker.jsx'

const ALIGN = [['left', 'Alinear a la izquierda', AlignLeft], ['center', 'Centrar', AlignCenter], ['right', 'Alinear a la derecha', AlignRight], ['justify', 'Justificar', AlignJustify]]

// Only variants with a real bundled file for the family (no fake "No disponible" rows).
export const availableVariants = family => Object.keys(STUDIO_FONT_VARIANTS).filter(variant => studioFontStyle(family, variant))

// Edit the words from the toolbar, without touching the canvas: reliable on touch
// when the on-screen keyboard was dismissed or the text is small and hard to tap.
function Content({ selection, disabled, onPatch }) {
  const field = useRef(null), [value, setValue] = useState(selection.text ?? '')
  // Follow remote or canvas edits, but never rewrite what is being typed here.
  useEffect(() => { if (field.current?.ownerDocument.activeElement !== field.current) setValue(selection.text ?? '') }, [selection.text])
  return (
    <Popover>
      <PopoverTrigger asChild><ToolButton label="Editar el texto" side="bottom" disabled={disabled}><TextCursorInput /></ToolButton></PopoverTrigger>
      <PopoverContent align="start" collisionPadding={12} className="w-[min(22rem,calc(100vw-1.5rem))] space-y-2 p-3">
        <Textarea ref={field} aria-label="Contenido del texto" rows={4} disabled={disabled} value={value} className="text-base"
          onChange={event => { setValue(event.target.value); onPatch({ text: event.target.value }) }} />
        <p className="text-xs text-[hsl(var(--muted-foreground))]">El cambio se ve en el lienzo mientras escribes.</p>
      </PopoverContent>
    </Popover>
  )
}

function Paragraph({ selection, disabled, onPatch, live }) {
  const Icon = ALIGN.find(([value]) => value === (selection.textAlign ?? 'left'))?.[2] ?? AlignLeft
  return (
    <Popover>
      <PopoverTrigger asChild><ToolButton label="Párrafo y espaciado" side="bottom" disabled={disabled}><Icon /></ToolButton></PopoverTrigger>
      <PopoverContent align="center" className="w-72 space-y-3 p-3">
        <div className="flex items-center justify-between gap-1" role="group" aria-label="Alineación del párrafo">
          {ALIGN.map(([value, label, AlignIcon]) => (
            <ToolButton key={value} label={label} side="bottom" active={(selection.textAlign ?? 'left') === value} disabled={disabled} onClick={() => onPatch({ textAlign: value })}><AlignIcon /></ToolButton>
          ))}
          <span aria-hidden className="mx-0.5 h-6 w-px bg-[hsl(var(--border))]" />
          <ToolButton label="Subrayado" side="bottom" active={Boolean(selection.underline)} disabled={disabled} onClick={() => onPatch({ underline: !selection.underline })}><Underline /></ToolButton>
          <ToolButton label="Tachado" side="bottom" active={Boolean(selection.linethrough)} disabled={disabled} onClick={() => onPatch({ linethrough: !selection.linethrough })}><Strikethrough /></ToolButton>
        </div>
        <SliderRow label="Interlineado" min={50} max={300} step={2} zero={116} value={Math.round((selection.lineHeight ?? 1.16) * 100)} format={value => (value / 100).toFixed(2)} disabled={disabled}
          onStart={live?.begin} onCommit={live?.end} onChange={value => (live ? live.patch : onPatch)({ lineHeight: value / 100 })} />
        <SliderRow label="Espaciado entre letras" min={-200} max={800} step={10} zero={0} value={Math.round(selection.charSpacing ?? 0)} format={value => `${value > 0 ? '+' : ''}${value}`} disabled={disabled}
          onStart={live?.begin} onCommit={live?.end} onChange={value => (live ? live.patch : onPatch)({ charSpacing: value })} />
      </PopoverContent>
    </Popover>
  )
}

// `live` (optional): non-blocking patch + begin/end so slider drags stay enabled and form one undo step.
export function TextSelectionControls({ selection, disabled, onPatch, live }) {
  const variants = availableVariants(selection.fontFamily), variant = selection.fontVariant ?? 'regular'
  return <div role="group" aria-label="Formato de texto" className="flex min-w-0 flex-wrap items-center gap-1 max-sm:flex-nowrap max-sm:[&>*]:shrink-0">
    <Content selection={selection} disabled={disabled} onPatch={onPatch} />
    <StudioFontPicker compact value={selection.fontFamily} disabled={disabled}
      onChange={fontFamily => onPatch({ fontFamily, fontVariant: studioFontStyle(fontFamily, variant) ? variant : 'regular' })} />
    {variants.length > 1 ? (
      <Select value={variant} disabled={disabled} onValueChange={fontVariant => onPatch({ fontVariant })}>
        <SelectTrigger aria-label="Estilo de la fuente" className="h-10 w-32 shrink-0 border-transparent shadow-none sm:h-9"><SelectValue /></SelectTrigger>
        <SelectContent className="motion-reduce:animate-none">
          {variants.map(option => {
            const style = STUDIO_FONT_VARIANTS[option]
            return <SelectItem key={option} value={option}><span style={{ fontFamily: selection.fontFamily, fontWeight: style.weight, fontStyle: style.style }}>{VARIANT_LABELS[option] ?? option}</span></SelectItem>
          })}
        </SelectContent>
      </Select>
    ) : null}
    <NumberStepper label="Tamaño de letra" size="sm" min={8} max={500} step={2} value={Math.round(selection.fontSize)} disabled={disabled} onChange={fontSize => onPatch({ fontSize })} />
    <ColorPopover label="Color del texto" value={selection.fill} disabled={disabled} onChange={fill => onPatch({ fill })} />
    <Paragraph selection={selection} disabled={disabled} onPatch={onPatch} live={live} />
  </div>
}
