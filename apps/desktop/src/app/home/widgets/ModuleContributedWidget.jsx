// Generic Home widget for what a Builder module declares in `homeWidgets`: a big count
// or a short list of its records. Opens the module on click.
import { useNavigate } from "react-router-dom";
import { runly } from "../../../lib/runly";
import { getModuleLaunchPath } from "../../../lib/runtimeModules";
import { WidgetFrame, unwrap, useWidgetQuery } from "./WidgetFrame";

export function ModuleContributedWidget({ module, widget }) {
  const navigate = useNavigate();
  const query = useWidgetQuery(["module-widget", widget.moduleKey, widget.key], (token) => runly.modules.homeWidgetData(widget.moduleKey, widget.key, token));
  const data = unwrap(query.data) ?? {};
  const isCount = widget.kind === "count";
  const items = data.items ?? [];
  const open = () => navigate(getModuleLaunchPath(module));

  return (
    <WidgetFrame
      module={module}
      title={widget.label}
      subtitle={isCount ? undefined : data.total ? `${data.total} en total` : undefined}
      query={query}
      isEmpty={!isCount && items.length === 0}
      emptyText="No hay registros que mostrar."
    >
      {isCount ? (
        <button type="button" onClick={open} className="flex h-full w-full cursor-pointer flex-col items-start justify-center gap-1 rounded-lg px-1 text-left hover:bg-[hsl(var(--muted))]">
          <span className="text-5xl font-semibold tabular-nums leading-none text-[hsl(var(--foreground))]">{data.total ?? 0}</span>
          <span className="text-sm text-[hsl(var(--muted-foreground))]">{widget.label}</span>
        </button>
      ) : (
        <ul className="space-y-0.5">
          {items.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={open} className="flex w-full cursor-pointer flex-col rounded-md px-1 py-1 text-left hover:bg-[hsl(var(--muted))]">
                <span className="truncate text-sm font-medium leading-tight text-[hsl(var(--foreground))]">{item.title || "(sin título)"}</span>
                {item.detail && <span className="truncate text-xs text-[hsl(var(--muted-foreground))]">{item.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </WidgetFrame>
  );
}
