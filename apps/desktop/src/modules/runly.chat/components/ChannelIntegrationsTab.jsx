// "Integraciones" of a channel: external systems, automations and modules that post
// messages into it. Each one has a secret address (shown once, regenerable). Spec
// docs/superpowers/specs/2026-10-26-slack-parity-design.md, section 1.
import { useState } from "react";
import { Button, ConfirmDialog, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, IconPickerField, Skeleton, TextField, resolveLucideIcon } from "@runly/ui";
import { Copy, KeyRound, Plug, Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getApiUrl } from "../../../lib/runtimeConfig";
import { useChannelIntegrationActions, useChannelIntegrations } from "../hooks/useChannelIntegrations";

const hookUrl = (token) => `${getApiUrl()}/public/chat-hooks/${token}`;
const lastUse = (value) => (value ? new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "Sin uso");
const ROW_BUTTON = "flex h-8 w-8 cursor-pointer items-center justify-center rounded-md hover:bg-[hsl(var(--muted))] [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10";

function CreateDialog({ open, onClose, onCreate, pending }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const close = () => { onClose(); setName(""); setIcon(""); };
  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) close(); }}>
      <DialogContent size="md">
        <DialogHeader icon={Plug}><DialogTitle>Nueva integración</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <TextField label="Nombre" value={name} maxLength={80} placeholder="Ej. Despliegues" hint="Así se verá quién publica el mensaje." onChange={(e) => setName(e.target.value)} autoFocus />
          <IconPickerField label="Icono" value={icon} onChange={setIcon} placeholder="Elegir icono" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancelar</Button>
          <Button disabled={!name.trim() || pending} onClick={() => onCreate({ name: name.trim(), icon: icon || undefined })}>Crear integración</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddressDialog({ token, onClose }) {
  const url = token ? hookUrl(token) : "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast.success("Dirección copiada"); } catch { toast.error("No se pudo copiar: selecciona el texto y cópialo."); }
  };
  return (
    <Dialog open={Boolean(token)} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent size="lg">
        <DialogHeader icon={KeyRound}><DialogTitle>Dirección de la integración</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Cópiala ahora: por seguridad no se vuelve a mostrar. Quien tenga esta dirección puede publicar en el canal; si se filtra, regenérala.</p>
          <code className="block break-all rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/50 p-3 text-xs select-all">{url}</code>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Envía un POST con JSON: <span className="font-mono">{`{ "text": "Hola", "title": "Opcional", "link": "https://..." }`}</span></p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Listo</Button>
          <Button onClick={copy}><Copy size={14} aria-hidden className="mr-1.5" /> Copiar dirección</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ChannelIntegrationsTab({ conversationId }) {
  const { data, isLoading } = useChannelIntegrations(conversationId);
  const actions = useChannelIntegrationActions(conversationId);
  const [creating, setCreating] = useState(false);
  const [shownToken, setShownToken] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [toRotate, setToRotate] = useState(null);
  const items = data?.data ?? [];

  if (isLoading) return <div className="space-y-2 px-4 py-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}</div>;

  return (
    <div className="space-y-2 px-4 pb-3">
      {items.length === 0 && <p className="text-sm text-[hsl(var(--muted-foreground))]">Aún no hay integraciones. Crea una para que otro sistema publique mensajes en este canal.</p>}
      {items.length > 0 && (
        <ul className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))]">
          {items.map((item) => {
            const Icon = resolveLucideIcon(item.icon) ?? Plug;
            return (
              <li key={item.id} className="flex items-center gap-2 px-3 py-2">
                <Icon size={16} aria-hidden className={`shrink-0 ${item.enabled ? "" : "opacity-40"}`} />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-medium ${item.enabled ? "" : "text-[hsl(var(--muted-foreground))] line-through"}`}>{item.name}</p>
                  <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">...{item.tokenHint} · {item.messageCount} mensajes · {lastUse(item.lastUsedAt)}</p>
                </div>
                <button type="button" title={item.enabled ? "Desactivar" : "Activar"} aria-label={item.enabled ? "Desactivar" : "Activar"} onClick={() => actions.update.mutate({ id: item.id, enabled: !item.enabled })} className={ROW_BUTTON}><Power size={14} aria-hidden /></button>
                <button type="button" title="Regenerar dirección" aria-label="Regenerar dirección" onClick={() => setToRotate(item)} className={ROW_BUTTON}><KeyRound size={14} aria-hidden /></button>
                <button type="button" title="Eliminar" aria-label="Eliminar" onClick={() => setToDelete(item)} className={ROW_BUTTON}><Trash2 size={14} aria-hidden /></button>
              </li>
            );
          })}
        </ul>
      )}
      <Button size="sm" variant="outline" onClick={() => setCreating(true)}><Plus className="mr-1.5 h-3.5 w-3.5" /> Nueva integración</Button>

      <CreateDialog open={creating} pending={actions.create.isPending} onClose={() => setCreating(false)}
        onCreate={(values) => actions.create.mutate(values, { onSuccess: (res) => { setCreating(false); setShownToken(res?.data?.token ?? null); } })} />
      <AddressDialog token={shownToken} onClose={() => setShownToken(null)} />
      <ConfirmDialog open={Boolean(toRotate)} onOpenChange={(value) => { if (!value) setToRotate(null); }} title="Regenerar la dirección"
        description={`La dirección actual de «${toRotate?.name ?? ""}» dejará de funcionar. Tendrás que actualizarla donde se use.`} confirmLabel="Regenerar" tone="warning"
        onConfirm={() => actions.rotate.mutate(toRotate.id, { onSuccess: (res) => { setToRotate(null); setShownToken(res?.data?.token ?? null); } })} />
      <ConfirmDialog open={Boolean(toDelete)} onOpenChange={(value) => { if (!value) setToDelete(null); }} title="Eliminar integración"
        description={`«${toDelete?.name ?? ""}» dejará de poder publicar en este canal. Sus mensajes anteriores se conservan.`} confirmLabel="Eliminar"
        onConfirm={() => actions.remove.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })} />
    </div>
  );
}
