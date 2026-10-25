import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, TextareaField } from "@runly/ui";
import { ShieldX } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";
import { WidgetFrame, unwrap, useWidgetQuery } from "./WidgetFrame";

const MAX_ITEMS = 4;
const QUERY_KEY = ["automation-approvals"];

// Approvals that Builder automations are waiting on (spec
// 2026-10-25-automation-studio-v2-stage-c-reach-design.md, C3). When there is
// nothing to decide it says so: a widget the person added never renders as a blank cell.
export function ApprovalsWidget({ module }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState(null);
  const [comment, setComment] = useState("");
  const query = useWidgetQuery(QUERY_KEY, (accessToken) => runly.modules.myAutomationApprovals(accessToken));
  const items = unwrap(query.data) ?? [];

  const decide = useMutation({
    mutationFn: async ({ id, decision, note }) => {
      const result = await runly.modules.decideAutomationApproval(id, decision, note, token);
      if (result?.error) throw new Error(result.error);
    },
    onSuccess: (_data, variables) => {
      toast.success(variables.decision === "approve" ? "Aprobado" : "Rechazado");
      queryClient.invalidateQueries({ queryKey: ["home-widget", ...QUERY_KEY] });
      setRejecting(null);
      setComment("");
    },
    onError: (error) => toast.error("No se pudo registrar tu decisión", { description: error.message }),
  });

  return (
    <>
      <WidgetFrame module={module} title="Por aprobar" subtitle={items.length ? `${items.length} esperando tu decisión` : "Pendientes"} query={query} isEmpty={items.length === 0} emptyText="No tienes aprobaciones de automatizaciones pendientes.">
        <ul className="space-y-2">
          {items.slice(0, MAX_ITEMS).map((item) => (
            <li key={item.id} className="space-y-1.5 rounded-md border border-[hsl(var(--border))] p-2">
              <p className="text-sm leading-tight text-[hsl(var(--foreground))]">{item.message}</p>
              <div className="flex gap-2">
                <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: item.id, decision: "approve" })}>Aprobar</Button>
                <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => setRejecting(item)}>Rechazar</Button>
              </div>
            </li>
          ))}
        </ul>
        {items.length > MAX_ITEMS && <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">+{items.length - MAX_ITEMS} más</p>}
      </WidgetFrame>
      <Dialog open={Boolean(rejecting)} onOpenChange={(open) => { if (!open) { setRejecting(null); setComment(""); } }}>
        <DialogContent size="md">
          <DialogHeader icon={ShieldX} tone="destructive">
            <DialogTitle>Rechazar</DialogTitle>
            <DialogDescription>{rejecting?.message}</DialogDescription>
          </DialogHeader>
          <TextareaField label="Motivo (opcional)" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={decide.isPending} onClick={() => decide.mutate({ id: rejecting.id, decision: "reject", note: comment || undefined })}>
              {decide.isPending ? "Enviando..." : "Rechazar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
