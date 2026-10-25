import { ArrowDown, ArrowUp, Columns2, Columns3, RectangleHorizontal, SlidersHorizontal } from "lucide-react";
import { SIZE_LABELS } from "../../lib/homeWidgets";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
} from "@runly/ui";

// "Personalizar": one switch per widget the user can see.
const SIZE_ICON = { sm: RectangleHorizontal, md: Columns2, lg: Columns3 };
const SPAN = { sm: "", md: "md:col-span-2", lg: "md:col-span-2 xl:col-span-3" };

const ICON_BUTTON = "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11";

export function HomeWidgetCustomizer({ widgets, hidden, sizes = {}, onToggle, onMove, onCycleSize }) {
  if (widgets.length === 0) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <SlidersHorizontal size={14} aria-hidden />
          Personalizar
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[26rem] max-w-[calc(100vw-1.5rem)] p-0">
        <div className="border-b border-[hsl(var(--border))] px-4 py-3">
          <p className="text-sm font-semibold text-[hsl(var(--foreground))]">Widgets de inicio</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Elige qué resúmenes ver, en qué orden y de qué tamaño.
          </p>
        </div>
        <ul className="max-h-80 overflow-y-auto py-1">
          {widgets.map((w, index) => {
            const id = `home-widget-${w.id}`;
            const size = sizes[w.id] ?? "sm";
            const SizeIcon = SIZE_ICON[size] ?? RectangleHorizontal;
            return (
              <li key={w.id} className="flex items-center gap-1 pr-2 transition-colors hover:bg-[hsl(var(--muted))]/50">
                <label htmlFor={id} className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 py-2 pl-4">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[hsl(var(--foreground))]">{w.title}</span>
                    <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">{w.description}</span>
                  </span>
                  <Switch id={id} checked={!hidden.includes(w.id)} onCheckedChange={() => onToggle(w.id)} />
                </label>
                {onCycleSize && (
                  <button type="button" className={ICON_BUTTON} onClick={() => onCycleSize(w.id)} aria-label={`Tamaño de ${w.title}: ${SIZE_LABELS[size]}. Cambiar`} title={`Tamaño: ${SIZE_LABELS[size]}`}>
                    <SizeIcon size={16} aria-hidden />
                  </button>
                )}
                {onMove && (
                  <>
                    <button type="button" className={ICON_BUTTON} disabled={index === 0} onClick={() => onMove(w.id, -1)} aria-label={`Subir ${w.title}`}><ArrowUp size={16} aria-hidden /></button>
                    <button type="button" className={ICON_BUTTON} disabled={index === widgets.length - 1} onClick={() => onMove(w.id, 1)} aria-label={`Bajar ${w.title}`}><ArrowDown size={16} aria-hidden /></button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function HomeWidgetBoard({ widgets, modulesByKey, sizes = {} }) {
  if (widgets.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {widgets.map(({ id, moduleKey, Component }) => (
        <div key={id} className={`min-w-0 ${SPAN[sizes[id]] ?? ""}`}>
          <Component module={modulesByKey.get(moduleKey)} />
        </div>
      ))}
    </div>
  );
}
