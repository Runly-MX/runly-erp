// Module Builder — "Destinos permitidos": hosts the HTTP step of automations
// may call. Everyone can read the list; only administrators (core.modules.manage)
// edit it (spec 2026-10-25-automation-studio-v2-stage-c-reach-design.md, C2).
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, TextField } from "@runly/ui";
import { Globe, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../../auth/AuthProvider";
import { runly } from "../../../../lib/runly";

export function AutomationHostsDialog({ open, onOpenChange }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const queryClient = useQueryClient();
  const [hosts, setHosts] = useState([]);
  const [draft, setDraft] = useState("");
  const query = useQuery({
    queryKey: ["automation-http-hosts"],
    queryFn: async () => (await runly.modules.automationHttpHosts(token))?.data ?? { hosts: [], canManage: false },
    enabled: open && Boolean(token),
  });
  const canManage = Boolean(query.data?.canManage);
  useEffect(() => { if (open && query.data) setHosts(query.data.hosts ?? []); }, [open, query.data]);

  const save = useMutation({
    mutationFn: async () => {
      const result = await runly.modules.setAutomationHttpHosts(hosts, token);
      if (result?.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      toast.success("Destinos permitidos actualizados");
      queryClient.setQueryData(["automation-http-hosts"], (current) => ({ ...(current ?? {}), hosts: data.hosts }));
      onOpenChange(false);
    },
    onError: (error) => toast.error("No se pudo guardar", { description: error.message }),
  });

  const add = () => {
    const value = draft.trim().toLowerCase();
    if (!value || hosts.includes(value)) return;
    setHosts([...hosts, value]);
    setDraft("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="flex max-h-[92dvh] flex-col">
        <DialogHeader icon={Globe}>
          <DialogTitle>Destinos permitidos</DialogTitle>
          <DialogDescription>El paso «Llamar a una URL» solo puede enviar datos a estos servidores (https). Escribe solo el nombre, por ejemplo hooks.ejemplo.com.</DialogDescription>
        </DialogHeader>
        <div className="-mx-6 min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-1">
          <div className="flex flex-wrap gap-1.5">
            {hosts.length === 0 && <span className="text-sm text-[hsl(var(--muted-foreground))]">Aún no hay destinos: las llamadas HTTP fallarán.</span>}
            {hosts.map((host) => (
              <Badge key={host} variant="secondary" className="gap-1">
                {host}
                {canManage && (
                  <button type="button" aria-label={`Quitar ${host}`} className="cursor-pointer" onClick={() => setHosts(hosts.filter((item) => item !== host))}>
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            ))}
          </div>
          {canManage ? (
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <TextField label="Agregar destino" value={draft} placeholder="hooks.ejemplo.com"
                  onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
              </div>
              <Button variant="outline" onClick={add}><Plus className="mr-1 h-4 w-4" /> Agregar</Button>
            </div>
          ) : (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Solo quien administra módulos puede cambiar esta lista.</p>
          )}
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            No se permiten direcciones internas ni redirecciones. Cada llamada va firmada con HMAC-SHA256 (X-Runly-Signature).
          </p>
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{canManage ? "Cancelar" : "Cerrar"}</Button>
          {canManage && <Button disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Guardando..." : "Guardar"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
