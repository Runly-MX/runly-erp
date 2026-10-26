import { useState } from 'react'
import { Button, Input, SegmentedControl, Textarea, ToolButton } from '@runly/ui'
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalDistributeCenter, AlignStartHorizontal,
  AlignStartVertical, AlignVerticalDistributeCenter, ArrowDown, ArrowUp, BringToFront, ClipboardPaste, Copy, CopyPlus, Eye, EyeOff, Lock,
  Group, MousePointerClick, RotateCcw, RotateCw, Ruler, SendToBack, Trash2, Ungroup, Unlock, ZoomIn, ZoomOut,
} from 'lucide-react'
import { StudioColorPicker } from './editor/StudioColorPicker.jsx'
import { ShapeStyleFields } from './editor/ShapeSelectionControls.jsx'
import { FillPicker } from './editor/paint/FillControls.jsx'
import { canHoldPhoto, isShape } from '../lib/photo-target.js'
import { paintCss } from '../lib/paint.js'
import { OBJECT_META } from './editor/LayersPanel.jsx'

const ALIGN = [
  ['left', 'Alinear a la izquierda', AlignStartVertical], ['center', 'Centrar horizontalmente', AlignCenterVertical], ['right', 'Alinear a la derecha', AlignEndVertical],
  ['top', 'Alinear arriba', AlignStartHorizontal], ['middle', 'Centrar verticalmente', AlignCenterHorizontal], ['bottom', 'Alinear abajo', AlignEndHorizontal],
  ['distribute-x', 'Distribuir horizontalmente', AlignHorizontalDistributeCenter], ['distribute-y', 'Distribuir verticalmente', AlignVerticalDistributeCenter],
]
const ORDER = [['front', 'Traer al frente', BringToFront], ['up', 'Subir un nivel', ArrowUp], ['down', 'Bajar un nivel', ArrowDown], ['back', 'Enviar al fondo', SendToBack]]
const METRICS = { x: 'X', y: 'Y', width: 'An', height: 'Al', rotation: '°', fontSize: 'Tam' }
const METRIC_LABELS = { x: 'Posición X', y: 'Posición Y', width: 'Ancho', height: 'Alto', rotation: 'Rotación', fontSize: 'Tamaño de letra' }

function Section({ title, children }) {
  return (
    <section className="space-y-2.5 border-b border-[hsl(var(--border))] px-4 py-4 last:border-b-0">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">{title}</h3>
      {children}
    </section>
  )
}

function Metric({ name, value, disabled, onCommit }) {
  return (
    <label className="relative block">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">{METRICS[name]}</span>
      <Input aria-label={METRIC_LABELS[name]} type="number" inputMode="decimal" disabled={disabled} className="pl-9 text-right tabular-nums"
        value={Math.round(value * 100) / 100} onChange={event => { if (event.target.value !== '') onCommit(Number(event.target.value)) }} />
    </label>
  )
}

function Alignment({ count, disabled, onAlign }) {
  const [target, setTarget] = useState('page')
  return (
    <Section title="Alinear">
      <SegmentedControl ariaLabel="Alinear respecto a" value={target} onChange={setTarget} disabled={disabled}
        options={[{ value: 'page', label: 'A la página' }, { value: 'selection', label: 'Entre sí' }]} />
      <div className="grid grid-cols-4 gap-1">
        {ALIGN.map(([action, label, Icon]) => (
          <ToolButton key={action} label={label} side="bottom" className="h-10 w-full"
            disabled={disabled || count < (action.startsWith('distribute') ? 3 : 1)} onClick={() => onAlign(action, target)}><Icon /></ToolButton>
        ))}
      </div>
      <p className="text-xs text-[hsl(var(--muted-foreground))]">Distribuir necesita 3 o más elementos. Los bloqueados y ocultos no se mueven.</p>
    </Section>
  )
}

// Flat group scale/rotation through the engine's transformGroup (one undo
// step each, around the group's centre). Fabric's multi-selection handles stay
// locked: they cannot preserve every member's appearance yet.
function GroupTransform({ disabled, onTransform }) {
  const step = (label, Icon, options) => <ToolButton label={label} side="bottom" className="h-10 w-full" disabled={disabled} onClick={() => onTransform(options)}><Icon /></ToolButton>
  return (
    <Section title="Transformar grupo">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Escala</p>
          <div className="grid grid-cols-2 gap-1">{step('Reducir 10 %', ZoomOut, { scale: 1 / 1.1 })}{step('Ampliar 10 %', ZoomIn, { scale: 1.1 })}</div>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Giro</p>
          <div className="grid grid-cols-2 gap-1">{step('Girar 15° a la izquierda', RotateCcw, { rotation: -15 })}{step('Girar 15° a la derecha', RotateCw, { rotation: 15 })}</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1">
        <Button variant="ghost" size="sm" className="text-xs" disabled={disabled} onClick={() => onTransform({ rotation: 90 })}>Girar 90°</Button>
        <Button variant="ghost" size="sm" className="text-xs" disabled={disabled} onClick={() => onTransform({ rotation: 180 })}>Girar 180°</Button>
        <Button variant="ghost" size="sm" className="text-xs" disabled={disabled} onClick={() => onTransform({ scale: 2 })}>Doble tamaño</Button>
      </div>
      <p className="text-xs text-[hsl(var(--muted-foreground))]">Escala proporcional y giro alrededor del centro del grupo. Cada paso se deshace con Ctrl+Z.</p>
    </Section>
  )
}

// `photoTools`: live photo editing (crop, filters, adjustments, effects) shown
// first for photos (frames and shape fills). `shapeTools`: shape photo, fill
// (none/solid/gradient/photo), border and radius operations (useImageTools).
// `group`: {id, count} when the selection is exactly one flat group.
export function StudioInspector({ selection, selectedCount, page, busy, readOnly, canPaste, onPatch, onRemove, onAction, onOrder, onAlign, onOpenPage, photoTools, shapeTools,
  group, grouping, onTransformGroup, onError }) {
  const locked = Boolean(selection?.locked), disabled = busy || readOnly
  if (!selection && selectedCount < 2) {
    return (
      <div>
        <Section title="Página">
          <div className="flex items-center gap-3">
            <span aria-hidden className="h-10 w-10 shrink-0 rounded-md border border-[hsl(var(--border))]" style={{ background: paintCss(page.backgroundPaint) ?? page.background }} />
            <div className="min-w-0">
              <p className="text-sm font-semibold tabular-nums">{page.width} × {page.height} px</p>
              <p className="font-mono text-xs uppercase text-[hsl(var(--muted-foreground))]">{page.backgroundPaint ? `Degradado ${page.backgroundPaint.gradientType === 'linear' ? 'lineal' : 'radial'}` : page.background}</p>
            </div>
          </div>
          <Button variant="outline" className="w-full" disabled={readOnly} onClick={onOpenPage}><Ruler />Tamaño y fondo</Button>
        </Section>
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[hsl(var(--muted))]"><MousePointerClick className="h-5 w-5 text-[hsl(var(--muted-foreground))]" /></span>
          <p className="text-sm font-semibold">Selecciona un elemento</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Toca cualquier forma, texto o imagen para editar su color, tamaño y posición.</p>
          {canPaste && !readOnly ? <Button size="sm" variant="ghost" onClick={() => onAction('paste')}><ClipboardPaste />Pegar</Button> : null}
        </div>
      </div>
    )
  }
  if (!selection) {
    return (
      <div>
        <Section title={group ? 'Grupo' : 'Selección'}>
          <p className="text-sm font-semibold">{group ? `Grupo de ${group.count} elementos` : `${selectedCount} elementos seleccionados`}</p>
          <div className="grid grid-cols-2 gap-2">
            {grouping?.canGroup ? <Button variant="outline" size="sm" disabled={disabled} onClick={() => onAction('group')}><Group />Agrupar</Button> : null}
            {grouping?.canUngroup ? <Button variant="outline" size="sm" disabled={disabled} onClick={() => onAction('ungroup')}><Ungroup />Desagrupar</Button> : null}
            <Button variant="outline" size="sm" disabled={disabled} onClick={() => onAction('duplicate')}><CopyPlus />Duplicar</Button>
            <Button variant="outline" size="sm" className="text-destructive" disabled={disabled} onClick={onRemove}><Trash2 />Eliminar</Button>
          </div>
        </Section>
        {group && onTransformGroup ? <GroupTransform disabled={disabled} onTransform={onTransformGroup} /> : null}
        <Alignment count={selectedCount} disabled={disabled} onAlign={onAlign} />
      </div>
    )
  }
  const meta = OBJECT_META[selection.type], Icon = meta.icon
  const editable = disabled || locked
  return (
    <div>
      <div className="flex items-center gap-2 border-b border-[hsl(var(--border))] px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-300"><Icon className="h-4 w-4" /></span>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{meta.label}</p>
        <ToolButton label={selection.hidden ? 'Mostrar' : 'Ocultar'} side="bottom" disabled={disabled} onClick={() => onPatch({ hidden: !selection.hidden })}>{selection.hidden ? <EyeOff /> : <Eye />}</ToolButton>
        <ToolButton label={locked ? 'Desbloquear' : 'Bloquear'} side="bottom" active={locked} disabled={disabled} onClick={() => onPatch({ locked: !locked })}>{locked ? <Lock /> : <Unlock />}</ToolButton>
      </div>
      {photoTools && !locked ? <div className="border-b border-[hsl(var(--border))] px-4 py-4">{photoTools}</div> : null}
      {selection.type === 'text' ? (
        <Section title="Texto">
          <Textarea aria-label="Texto del elemento" rows={3} disabled={editable} value={selection.text} onChange={event => onPatch({ text: event.target.value })} />
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Fuente, estilo, tamaño, color, alineación y espaciado están en la barra del lienzo.</p>
        </Section>
      ) : null}
      {selection.type !== 'image' && selection.type !== 'text' && !(shapeTools && isShape(selection)) ? (
        <Section title="Color">
          <StudioColorPicker value={selection.fill} disabled={editable} onChange={fill => onPatch({ fill })} />
        </Section>
      ) : null}
      {shapeTools && isShape(selection) ? (
        <>
          <Section title="Relleno">
            <FillPicker item={selection} disabled={editable} tools={shapeTools} onPatch={onPatch} onError={onError} />
            {!canHoldPhoto(selection) ? <p className="text-xs text-[hsl(var(--muted-foreground))]">Degradados y fotos: solo en formas cerradas de un único trazo.</p> : null}
          </Section>
          <Section title="Borde y esquinas">
            <ShapeStyleFields selection={selection} disabled={editable} tools={shapeTools} />
          </Section>
        </>
      ) : null}
      <Section title="Posición y tamaño">
        <div className="grid grid-cols-2 gap-2">
          {['x', 'y', 'width', selection.type === 'text' ? null : 'height', 'rotation'].filter(Boolean).map(key => (
            <Metric key={key} name={key} value={selection[key]} disabled={editable} onCommit={value => onPatch({ [key]: value })} />
          ))}
        </div>
      </Section>
      <Alignment count={selectedCount || 1} disabled={editable} onAlign={onAlign} />
      <Section title="Organizar">
        <div className="grid grid-cols-4 gap-1">
          {ORDER.map(([key, label, OrderIcon]) => <ToolButton key={key} label={label} side="bottom" className="h-10 w-full" disabled={editable} onClick={() => onOrder(key)}><OrderIcon /></ToolButton>)}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" disabled={disabled} onClick={() => onAction('duplicate')}><CopyPlus />Duplicar</Button>
          <Button variant="outline" size="sm" onClick={() => onAction('copy')}><Copy />Copiar</Button>
          <Button variant="outline" size="sm" disabled={disabled || !canPaste} onClick={() => onAction('paste')}><ClipboardPaste />Pegar</Button>
          <Button variant="outline" size="sm" className="text-destructive" disabled={editable} onClick={onRemove}><Trash2 />Eliminar</Button>
        </div>
      </Section>
    </div>
  )
}
