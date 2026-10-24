import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { Button, Skeleton } from "@runly/ui";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";
import { ENTITY_TYPE_BY_VALUE } from "../lib/entityReferenceTypes";
import { EntityTypeTile } from "./EntityTypeTile";
import VehicleStatusBadge from "../../runly.fleet/components/VehicleStatusBadge";
import { InventoryStatusBadge } from "../../runly.inventory/components/InventoryStatusBadge";

export function EntityStatusChip({ reference }) {
  if (reference.entityType === "vehicle" && reference.status) return <VehicleStatusBadge status={reference.status} />;
  if (reference.entityType === "inventory_item" && reference.status) return <InventoryStatusBadge status={reference.status} />;
  if (reference.statusLabel) {
    return <span className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs font-medium">{reference.statusLabel}</span>;
  }
  return null;
}

// Live preview of a connector record (hover on desktop, tap on touch). The
// card snapshot stored with a message can be stale, so it is refetched; the
// snapshot (if any) shows instantly meanwhile.
// `loadPreview` lets another module (notes) use its own permission-aware endpoint
// instead of the chat one; its results are cached under a separate key.
export function EntityPreviewContent({ entityType, recordId, snapshot = null, onNavigate, loadPreview = null }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: [loadPreview ? "entity-preview-custom" : "chat-entity-preview", entityType, recordId],
    queryFn: async () => (loadPreview
      ? (await loadPreview(token))?.data ?? null
      : (await runly.chat.previewEntity(entityType, recordId, token))?.data ?? null),
    enabled: Boolean(token && entityType && recordId),
    staleTime: 60_000,
    retry: false,
  });
  // A 403/404 from the live check means this viewer cannot see the record (or it
  // is gone): never fall back to the stored snapshot then, it carries details
  // (phone, tax id, ...) that the viewer is not allowed to read.
  const denied = query.isError && [403, 404].includes(query.error?.status);
  const data = denied ? null : (query.data ?? snapshot);
  const meta = ENTITY_TYPE_BY_VALUE[entityType];

  if (!data) {
    if (query.isLoading) {
      return (
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="flex-1 space-y-2"><Skeleton className="h-3 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
        </div>
      );
    }
    return <p className="text-sm text-[hsl(var(--muted-foreground))]">Este registro ya no está disponible o no tienes acceso.</p>;
  }

  const open = () => { onNavigate?.(); navigate(data.url); };
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <EntityTypeTile reference={data} size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{meta?.label ?? "Registro"}</p>
          <p className="text-sm font-semibold leading-snug break-words">{data.title}</p>
          {data.subtitle ? <p className="text-xs text-[hsl(var(--muted-foreground))] break-words">{data.subtitle}</p> : null}
        </div>
        <EntityStatusChip reference={data} />
      </div>
      {data.details?.length ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {data.details.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-[hsl(var(--muted-foreground))]">{row.label}</dt>
              <dd className="min-w-0 break-words font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <Button type="button" size="sm" className="w-full" onClick={open}>
        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />Abrir
      </Button>
    </div>
  );
}
