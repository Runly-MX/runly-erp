// "Guardados": messages saved for later, those with a reminder first. Spec
// docs/superpowers/specs/2026-10-26-saved-and-reminders-design.md.
import { EmptyState, ErrorState, Sheet, SheetContent, SheetHeader, SheetTitle, Skeleton } from "@runly/ui";
import { BellRing, Bookmark, Check, X } from "lucide-react";
import { useSavedActions, useSavedMessages } from "../hooks/useSavedMessages";
import { remindText } from "../lib/reminderOptions";

const ICON_BUTTON = "flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10";

export function ChatSavedSheet({ open, onOpenChange, onOpen }) {
  const { data, isLoading, isError, refetch } = useSavedMessages(open);
  const actions = useSavedActions();
  const items = data ?? [];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader><SheetTitle className="flex items-center gap-2"><Bookmark className="h-4 w-4" aria-hidden /> Guardados</SheetTitle></SheetHeader>
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {isLoading && <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)}</div>}
          {isError && <ErrorState title="No se pudieron cargar los guardados" onRetry={refetch} />}
          {!isLoading && !isError && items.length === 0 && <EmptyState title="Nada guardado" description="En el menú de un mensaje elige Guardar para después o Recordarme, y lo encuentras aquí." />}
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.id} className="flex items-start gap-1 rounded-md hover:bg-[hsl(var(--muted))]/60">
                <button type="button" onClick={() => onOpen(item)} className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-md px-2 py-2 text-left [@media(pointer:coarse)]:min-h-14">
                  {item.remindAt ? <BellRing className={`mt-0.5 h-4 w-4 shrink-0 ${item.reminded ? "text-[hsl(var(--muted-foreground))]" : "text-[var(--brand-primary)]"}`} aria-hidden /> : <Bookmark className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.sender}</span>
                    <span className="block truncate text-sm">{item.excerpt || "Mensaje sin texto"}</span>
                    <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">{item.conversation}{item.remindAt ? ` · ${item.reminded ? "avisado" : "recordar"} ${remindText(item.remindAt)}` : ""}</span>
                  </span>
                </button>
                <button type="button" title="Marcar como hecho" aria-label="Marcar como hecho" onClick={() => actions.update.mutate({ messageId: item.messageId, completed: true })} className={ICON_BUTTON}><Check className="h-4 w-4" aria-hidden /></button>
                <button type="button" title="Quitar de guardados" aria-label="Quitar de guardados" onClick={() => actions.remove.mutate(item.messageId)} className={ICON_BUTTON}><X className="h-4 w-4" aria-hidden /></button>
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}
