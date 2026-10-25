import { useNavigate } from "react-router-dom";
import { runly } from "../../../lib/runly";
import { WidgetFrame, unwrap, useWidgetQuery } from "./WidgetFrame";

const MAX_ITEMS = 5;

function whenLabel(value) {
  const date = new Date(value);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay ? date.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" }) : date.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

// Where people mentioned you in chat in the last 7 days (read only: the answer is in chat).
export function MentionsWidget({ module, limit = MAX_ITEMS }) {
  const navigate = useNavigate();
  const query = useWidgetQuery(["work-mentions"], (token) => runly.modules.workMentions(token));
  const data = unwrap(query.data) ?? {};
  const items = data.items ?? [];
  return (
    <WidgetFrame module={module} title="Menciones" subtitle={data.unread ? `${data.unread} sin leer` : "Últimos 7 días"} query={query} isEmpty={items.length === 0} emptyText="Nadie te ha mencionado esta semana.">
      <ul className="space-y-1">
        {items.slice(0, limit).map((item) => (
          <li key={item.id}>
            <button type="button" onClick={() => navigate(`/app/m/runly.chat?conversation=${item.conversationId}`)} className="flex w-full cursor-pointer items-start gap-2 rounded-md px-1 py-1 text-left hover:bg-[hsl(var(--muted))]">
              <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.unread ? "bg-(--brand-primary)" : "bg-transparent"}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium leading-tight text-[hsl(var(--foreground))]">{item.sender} · {item.conversation}</span>
                <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">{item.excerpt}</span>
              </span>
              <span className="shrink-0 text-xs text-[hsl(var(--muted-foreground))]">{whenLabel(item.createdAt)}</span>
            </button>
          </li>
        ))}
      </ul>
    </WidgetFrame>
  );
}
