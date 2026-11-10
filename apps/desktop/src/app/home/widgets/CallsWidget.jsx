import { Calendar, Mic, Phone, Video } from "lucide-react";
import chatQuickActions from "../../../modules/runly.chat/quickActions";
import { WidgetFrame } from "./WidgetFrame";

const ICONS = { Phone, Video, Mic, Calendar };

// One-click entry to every kind of call. The actions are the same ones the
// command palette offers (runly.chat/quickActions.js), so both stay in sync.
export function CallsWidget({ module }) {
  return (
    <WidgetFrame module={module} title="Llamadas" subtitle="Inicia una llamada o reunión">
      <div className="grid grid-cols-2 gap-2">
        {chatQuickActions.map((action) => {
          const Icon = ICONS[action.icon] ?? Phone;
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => action.run()}
              className="flex min-h-20 cursor-pointer flex-col items-start justify-between gap-2 rounded-xl border border-[hsl(var(--border))] p-3 text-left transition-colors hover:bg-[hsl(var(--muted))]"
            >
              <Icon size={18} style={{ color: action.color }} aria-hidden />
              <span className="text-sm font-medium leading-tight text-[hsl(var(--foreground))]">{action.title}</span>
            </button>
          );
        })}
      </div>
    </WidgetFrame>
  );
}
