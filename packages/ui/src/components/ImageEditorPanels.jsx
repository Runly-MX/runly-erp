import { useRef } from "react";
import {
  ArrowUpRight, Bold, ChevronDown, ChevronUp, Circle, Contrast, Copy, Crop, Droplets, FlipHorizontal2, FlipVertical2, Grid3x3, Hand,
  Highlighter, ImagePlus, Minus, MousePointer2, Moon, Palette, PenLine, Pipette, RectangleHorizontal, RotateCcw, RotateCw,
  Rotate3d, SlidersHorizontal, Sparkles, Sun, Trash2, Type, Undo2, Wand2,
} from "lucide-react";
import { Button } from "./Button.jsx";
import { ImageFilterStrip } from "./ImageFilterStrip.jsx";
import { ANNOTATION_COLORS } from "../lib/imageAnnotations.js";
import { FX_MODES } from "../lib/imageFx.js";
import { NO_ADJUST } from "../lib/imageEdit.js";

export const EDITOR_TOOLS = [
  { id: "crop", label: "Recortar", icon: Crop },
  { id: "turn", label: "Girar", icon: Rotate3d },
  { id: "filters", label: "Filtros", icon: Sparkles },
  { id: "adjust", label: "Ajustes", icon: SlidersHorizontal },
  { id: "annotate", label: "Dibujo", icon: PenLine },
  { id: "retouch", label: "Retoque", icon: Wand2 },
  { id: "layers", label: "Imagen", icon: ImagePlus },
];

export const RATIOS = [
  { id: "free", label: "Libre", ratio: null },
  { id: "orig", label: "Original", ratio: "original" },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "3:4", label: "3:4", ratio: 3 / 4 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
];

const TOOLS = [
  { id: "select", label: "Seleccionar y mover", icon: MousePointer2 },
  { id: "pan", label: "Mover vista", icon: Hand },
  { id: "pen", label: "Pincel", icon: PenLine },
  { id: "line", label: "Línea", icon: Minus },
  { id: "arrow", label: "Flecha", icon: ArrowUpRight },
  { id: "rect", label: "Recuadro", icon: RectangleHorizontal },
  { id: "ellipse", label: "Óvalo", icon: Circle },
  { id: "text", label: "Texto", icon: Type },
  { id: "dropper", label: "Cuentagotas", icon: Pipette },
];
const BRUSH_TYPES = [
  { id: "pen", label: "Lápiz", icon: PenLine },
  { id: "marker", label: "Marcador", icon: Highlighter },
  { id: "soft", label: "Suave", icon: Droplets },
];
const FX_ICONS = { blur: Droplets, pixelate: Grid3x3, lighten: Sun, darken: Moon, saturate: Palette, desaturate: Contrast };
const ADJUSTS = [
  { key: "brightness", label: "Brillo", min: 40, max: 160, zero: 100 },
  { key: "contrast", label: "Contraste", min: 40, max: 160, zero: 100 },
  { key: "saturation", label: "Saturación", min: 0, max: 200, zero: 100 },
  { key: "warmth", label: "Calidez", min: -100, max: 100, zero: 0 },
  { key: "vignette", label: "Viñeta", min: 0, max: 100, zero: 0 },
  { key: "blur", label: "Desenfoque", min: 0, max: 10, zero: 0 },
];

export function Section({ title, children }) {
  return (
    <section className="space-y-2.5">
      {title ? <h3 className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{title}</h3> : null}
      {children}
    </section>
  );
}

function ToolButton({ label, icon: Icon, active = false, disabled, onClick }) {
  return (
    <Button type="button" variant={active ? "secondary" : "outline"} aria-label={label} title={label} aria-pressed={active} disabled={disabled} onClick={onClick} className="h-11 w-11 p-0 sm:h-11 sm:w-11">
      <Icon className="h-5 w-5" />
    </Button>
  );
}

// Labelled range with a 44px-tall touch lane; tapping the value resets it.
export function SliderRow({ label, value, min, max, zero = min, format, disabled, onChange }) {
  const shown = format ? format(value) : `${value - zero > 0 ? "+" : ""}${value - zero}`;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-[hsl(var(--foreground))]">{label}</span>
        <button
          type="button"
          disabled={disabled || value === zero}
          onClick={() => onChange(zero)}
          title="Restablecer"
          className="min-h-8 min-w-12 rounded-md px-2 text-right text-xs tabular-nums text-[hsl(var(--muted-foreground))] enabled:hover:bg-[hsl(var(--muted))] enabled:hover:text-[hsl(var(--foreground))]"
        >
          {shown}
        </button>
      </div>
      <div className="flex h-11 items-center">
        <input type="range" min={min} max={max} step={1} value={value} disabled={disabled} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} className="h-2 w-full cursor-pointer accent-[hsl(var(--primary))]" />
      </div>
    </div>
  );
}

export function CropPanel({ ratioId, disabled, onRatio }) {
  return (
    <Section title="Proporción">
      <div className="flex flex-wrap gap-2">
        {RATIOS.map((r) => (
          <Button key={r.id} type="button" variant={ratioId === r.id ? "default" : "outline"} disabled={disabled} onClick={() => onRatio(r.id)} className="h-11 min-w-14 sm:h-11">
            {r.label}
          </Button>
        ))}
      </div>
      <p className="text-xs text-[hsl(var(--muted-foreground))]">Arrastra el recuadro para moverlo y las esquinas para cambiar su tamaño.</p>
    </Section>
  );
}

export function TurnPanel({ transform, disabled, onPatch }) {
  return (
    <>
      <Section title="Girar y voltear">
        <div className="flex flex-wrap gap-2">
          <ToolButton label="Girar a la izquierda" icon={RotateCcw} disabled={disabled} onClick={() => onPatch({ quarterTurns: transform.quarterTurns - 1 })} />
          <ToolButton label="Girar a la derecha" icon={RotateCw} disabled={disabled} onClick={() => onPatch({ quarterTurns: transform.quarterTurns + 1 })} />
          <ToolButton label="Voltear horizontalmente" icon={FlipHorizontal2} active={transform.flipX} disabled={disabled} onClick={() => onPatch({ flipX: !transform.flipX })} />
          <ToolButton label="Voltear verticalmente" icon={FlipVertical2} active={transform.flipY} disabled={disabled} onClick={() => onPatch({ flipY: !transform.flipY })} />
        </div>
      </Section>
      <Section title="Enderezar">
        <SliderRow label="Ángulo" value={transform.angle} min={-45} max={45} zero={0} format={(v) => `${v}°`} disabled={disabled} onChange={(v) => onPatch({ angle: v }, "angle")} />
        <p className="text-xs text-[hsl(var(--muted-foreground))]">También puedes girar con dos dedos sobre la imagen. Las anotaciones y las imágenes añadidas giran con la foto; el recorte se reinicia.</p>
      </Section>
    </>
  );
}

export function FiltersPanel({ thumb, filter, disabled, onSelect, onAmount }) {
  return (
    <Section title="Filtros">
      <ImageFilterStrip thumb={thumb} value={filter} onChange={onSelect} />
      {filter.id !== "none" ? <SliderRow label="Intensidad" value={filter.amount} min={0} max={100} zero={100} format={(v) => `${v}%`} disabled={disabled} onChange={onAmount} /> : null}
    </Section>
  );
}

export function AdjustPanel({ adjust, disabled, onChange }) {
  const dirty = JSON.stringify(adjust) !== JSON.stringify(NO_ADJUST);
  return (
    <Section title="Ajustes">
      {ADJUSTS.map(({ key, label, min, max, zero }) => (
        <SliderRow key={key} label={label} value={adjust[key]} min={min} max={max} zero={zero} disabled={disabled} onChange={(v) => onChange({ ...adjust, [key]: v }, `adj-${key}`)} />
      ))}
      <Button type="button" variant="ghost" disabled={disabled || !dirty} onClick={() => onChange({ ...NO_ADJUST })} className="h-11">
        Restablecer ajustes
      </Button>
    </Section>
  );
}

// `selected` is the element being edited (select tool); its colour, width and
// text options show here and the controls change it instead of the defaults.
export function AnnotatePanel({
  tool, brush, color, width, text, selected, count, zoomed = false, disabled,
  onTool, onBrush, onColor, onWidth, onText, onDelete, onDuplicate, onUndo, onClear,
}) {
  const isFx = selected?.type === "fx";
  const textActive = tool === "text" || selected?.type === "text";
  const brushActive = tool === "pen" || selected?.type === "pen";
  return (
    <>
      <Section title="Herramienta">
        <div className="flex flex-wrap gap-2">
          {TOOLS.map(({ id, label, icon }) => (
            <ToolButton key={id} label={label} icon={icon} active={tool === id} disabled={disabled} onClick={() => onTool(id)} />
          ))}
        </div>
      </Section>
      {tool === "pan" ? (
        <p role="status" className="rounded-lg bg-[hsl(var(--muted))] p-3 text-xs text-[hsl(var(--muted-foreground))]">
          {zoomed ? "Arrastra la imagen para moverte por ella." : "Acerca la imagen con la rueda, el pellizco o los botones +/− y luego arrástrala para moverte. Sirve para dibujar con precisión."}
        </p>
      ) : null}
      {tool === "select" && !selected ? (
        <p role="status" className="rounded-lg bg-[hsl(var(--muted))] p-3 text-xs text-[hsl(var(--muted-foreground))]">Toca un trazo, forma o texto para seleccionarlo. Arrástralo para moverlo; toca dos veces un texto para editarlo.</p>
      ) : null}
      {tool === "dropper" ? (
        <p role="status" className="rounded-lg bg-[hsl(var(--muted))] p-3 text-xs text-[hsl(var(--muted-foreground))]">Toca la imagen para tomar ese color.</p>
      ) : null}
      {brushActive ? (
        <Section title="Tipo de pincel">
          <div className="flex gap-2" role="radiogroup" aria-label="Tipo de pincel">
            {BRUSH_TYPES.map(({ id, label, icon: Icon }) => (
              <Button key={id} type="button" role="radio" aria-checked={brush === id} variant={brush === id ? "default" : "outline"} disabled={disabled} onClick={() => onBrush(id)} className="h-11 flex-1">
                <Icon className="mr-1.5 h-4 w-4" />{label}
              </Button>
            ))}
          </div>
        </Section>
      ) : null}
      {isFx ? null : (
      <Section title="Color">
        <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Color">
          {ANNOTATION_COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={color.toLowerCase() === c} aria-label={`Color ${c}`} onClick={() => onColor(c)} className="flex h-11 w-11 items-center justify-center rounded-full">
              <span className={`h-8 w-8 rounded-full border-2 transition-transform ${color.toLowerCase() === c ? "scale-110 border-[hsl(var(--primary))]" : "border-[hsl(var(--border))]"}`} style={{ backgroundColor: c }} />
            </button>
          ))}
          <button type="button" aria-label="Color personalizado" className="relative flex h-11 w-11 items-center justify-center rounded-full">
            <span className="h-8 w-8 rounded-full border-2 border-dashed border-[hsl(var(--border))] [background:conic-gradient(red,yellow,lime,aqua,blue,magenta,red)]" />
            <input type="color" value={color} aria-label="Elegir color" onChange={(e) => onColor(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
          </button>
        </div>
      </Section>
      )}
      {isFx ? (
        <p role="status" className="rounded-lg bg-[hsl(var(--muted))] p-3 text-xs text-[hsl(var(--muted-foreground))]">Retoque seleccionado: puedes moverlo, duplicarlo o eliminarlo.</p>
      ) : (
        <SliderRow label={textActive ? "Tamaño del texto" : "Grosor"} value={width} min={1} max={textActive ? 40 : 30} zero={4} format={(v) => `${v}px`} disabled={disabled} onChange={onWidth} />
      )}
      {textActive ? (
        <Section title="Texto">
          <div className="flex gap-2">
            <Button type="button" variant={text.bold ? "default" : "outline"} aria-pressed={text.bold} disabled={disabled} onClick={() => onText({ bold: !text.bold })} className="h-11">
              <Bold className="mr-1.5 h-4 w-4" />Negrita
            </Button>
            <Button type="button" variant={text.bg ? "default" : "outline"} aria-pressed={text.bg} disabled={disabled} onClick={() => onText({ bg: !text.bg })} className="h-11">
              Fondo
            </Button>
          </div>
        </Section>
      ) : null}
      {selected ? (
        <Section title="Elemento seleccionado">
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={disabled} onClick={onDuplicate} className="h-11"><Copy className="mr-1.5 h-4 w-4" />Duplicar</Button>
            <Button type="button" variant="outline" disabled={disabled} onClick={onDelete} className="h-11 text-[hsl(var(--destructive))]"><Trash2 className="mr-1.5 h-4 w-4" />Eliminar</Button>
          </div>
        </Section>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" variant="outline" disabled={count === 0} onClick={onUndo} className="h-11">
          <Undo2 className="mr-1.5 h-4 w-4" />Quitar última
        </Button>
        <Button type="button" variant="ghost" disabled={count === 0} onClick={onClear} className="h-11">
          Limpiar
        </Button>
      </div>
    </>
  );
}

export function RetouchPanel({ fx, count, disabled, onChange, onUndo, onClear }) {
  return (
    <>
      <Section title="Retoque con pincel">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Efecto">
          {FX_MODES.map(({ id, label }) => {
            const Icon = FX_ICONS[id];
            return (
              <Button key={id} type="button" role="radio" aria-checked={fx.mode === id} variant={fx.mode === id ? "default" : "outline"} disabled={disabled} onClick={() => onChange({ mode: id })} className="h-12 justify-start">
                <Icon className="mr-2 h-4 w-4" />{label}
              </Button>
            );
          })}
        </div>
      </Section>
      <SliderRow label="Tamaño del pincel" value={fx.size} min={8} max={160} zero={40} format={(v) => `${v}px`} disabled={disabled} onChange={(size) => onChange({ size })} />
      <SliderRow label="Intensidad" value={fx.strength} min={5} max={100} zero={60} format={(v) => `${v}%`} disabled={disabled} onChange={(strength) => onChange({ strength })} />
      <p className="text-xs text-[hsl(var(--muted-foreground))]">Pinta sobre la imagen. Pixelar y desenfocar sirven para tapar caras, placas o datos. Cada pasada se puede deshacer.</p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" disabled={count === 0} onClick={onUndo} className="h-11"><Undo2 className="mr-1.5 h-4 w-4" />Quitar último</Button>
        <Button type="button" variant="ghost" disabled={count === 0} onClick={onClear} className="h-11">Limpiar retoques</Button>
      </div>
    </>
  );
}

export function LayersPanel({ layers, selectedId, disabled, onAdd, onSelect, onPatch, onDuplicate, onMove, onDelete }) {
  const inputRef = useRef(null);
  const selected = layers.find((l) => l.id === selectedId) ?? null;
  return (
    <>
      <Section title="Imágenes añadidas">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            onAdd(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <Button type="button" variant="outline" disabled={disabled} onClick={() => inputRef.current?.click()} className="h-11 w-full">
          <ImagePlus className="mr-2 h-4 w-4" />Agregar imagen
        </Button>
        {layers.length > 0 ? (
          <div className="flex flex-wrap gap-2" role="listbox" aria-label="Capas">
            {layers.map((l, i) => (
              <button
                key={l.id}
                type="button"
                role="option"
                aria-selected={l.id === selectedId}
                aria-label={`Imagen ${i + 1}`}
                onClick={() => onSelect(l.id)}
                className={`h-14 w-14 overflow-hidden rounded-lg border-2 bg-[hsl(var(--muted))] ${l.id === selectedId ? "border-[hsl(var(--primary))]" : "border-transparent"}`}
              >
                <img src={l.src} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Agrega logos, sellos o fotos encima de la imagen. Muévelas, escálalas y gíralas con las asas o con dos dedos.</p>
        )}
      </Section>
      {selected ? (
        <Section title="Imagen seleccionada">
          <SliderRow label="Opacidad" value={Math.round(selected.opacity * 100)} min={10} max={100} zero={100} format={(v) => `${v}%`} disabled={disabled} onChange={(v) => onPatch(selected.id, { opacity: v / 100 }, `op-${selected.id}`)} />
          <div className="flex flex-wrap gap-2">
            <ToolButton label="Voltear imagen" icon={FlipHorizontal2} active={selected.flipX} disabled={disabled} onClick={() => onPatch(selected.id, { flipX: !selected.flipX })} />
            <ToolButton label="Duplicar imagen" icon={Copy} disabled={disabled} onClick={() => onDuplicate(selected.id)} />
            <ToolButton label="Traer al frente" icon={ChevronUp} disabled={disabled || layers[layers.length - 1].id === selected.id} onClick={() => onMove(selected.id, 1)} />
            <ToolButton label="Enviar atrás" icon={ChevronDown} disabled={disabled || layers[0].id === selected.id} onClick={() => onMove(selected.id, -1)} />
            <ToolButton label="Eliminar imagen" icon={Trash2} disabled={disabled} onClick={() => onDelete(selected.id)} />
          </div>
        </Section>
      ) : null}
    </>
  );
}

