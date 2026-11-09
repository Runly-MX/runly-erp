// Marketplace catalog source (instance administrators). Feed URLs, cache policy
// and the trust store view. Official/community keys ship with Runly releases and
// cannot be added here; an administrator may only add managed-catalog keys or
// revoke a key locally (never re-trust or promote it). No private keys exist here.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, SegmentedControl, Skeleton, Switch, ErrorState, Badge, Textarea } from "@runly/ui";
import { ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { runly } from "../../../lib/runly";
import { SOURCE_MODES } from "../lib/marketplace";

const DOMAIN_LABELS = { official: "Oficial Runly", community: "Comunidad", managed: "Administrado" };
const STATE_LABELS = { active: "Activa", retiring: "En retiro", revoked: "Revocada" };

function SourceForm({ source, token, onDone }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState(source.mode ?? "runly");
  const [officialUrl, setOfficialUrl] = useState(source.officialUrl ?? "");
  const [communityUrl, setCommunityUrl] = useState(source.communityUrl ?? "");
  const [managedKeys, setManagedKeys] = useState((source.managedKeys ?? []).map((k) => (typeof k === "string" ? k : k.publicKey)).join("\n"));
  const [allowCachedView, setAllowCachedView] = useState(source.policy.allowCachedView);
  const [maxCacheAgeDays, setMaxCacheAgeDays] = useState(String(source.policy.maxCacheAgeDays));
  const [installFreshHours, setInstallFreshHours] = useState(String(source.policy.installFreshHours));
  const [installMaxAgeHours, setInstallMaxAgeHours] = useState(String(source.policy.installMaxAgeHours));
  const [revoking, setRevoking] = useState(null);
  const refresh = () => ["module-catalog-v2", "module-catalog-v2-source"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
  const save = useMutation({
    mutationFn: () => runly.moduleCatalog.configureSourceV2({ mode, ...(mode === "custom" ? { officialUrl: officialUrl.trim(), communityUrl: communityUrl.trim() } : {}), managedKeys: managedKeys.split("\n").map((k) => k.trim()).filter(Boolean), policy: { allowCachedView, maxCacheAgeDays: Number(maxCacheAgeDays), installFreshHours: Number(installFreshHours), installMaxAgeHours: Number(installMaxAgeHours) } }, token),
    onSuccess: () => { toast.success("Origen del catálogo guardado"); refresh(); onDone(); },
    onError: (error) => toast.error("No se pudo guardar", { description: error.details?.message ?? error.message }),
  });
  const revoke = useMutation({
    mutationFn: (keyId) => runly.moduleCatalog.configureSourceV2({ revokeKeyIds: [keyId] }, token),
    onSuccess: () => { toast.success("Clave revocada en esta instancia"); setRevoking(null); refresh(); },
    onError: (error) => toast.error("No se pudo revocar", { description: error.details?.message ?? error.message }),
  });
  return (
    <>
      <div className="-mx-6 min-h-0 flex-1 space-y-4 overflow-y-auto px-6">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Origen</h3>
          <SegmentedControl ariaLabel="Origen" value={mode} onChange={setMode} options={SOURCE_MODES.map((option) => ({ value: option.id, label: option.label }))} className="[&_button]:min-w-0" />
        {mode === "runly" && <p className="break-all text-xs text-[hsl(var(--muted-foreground))]">Se usan los feeds firmados de Runly Developer Hub: {source.defaults.officialUrl} y {source.defaults.communityUrl}.</p>}
        {mode === "disabled" && <p className="text-xs text-[hsl(var(--muted-foreground))]">El Marketplace no consulta ningún catálogo. Los módulos instalados siguen funcionando.</p>}
        {mode === "custom" && <>
        <div className="space-y-1">
          <Label htmlFor="catalog-official-url">Catálogo oficial (snapshot firmado)</Label>
          <Input id="catalog-official-url" value={officialUrl} onChange={(e) => setOfficialUrl(e.target.value)} placeholder="https://…/catalog/official" maxLength={2048} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="catalog-community-url">Catálogo de comunidad o administrado (v2 firmado)</Label>
          <Input id="catalog-community-url" value={communityUrl} onChange={(e) => setCommunityUrl(e.target.value)} placeholder="https://…/catalog/community" maxLength={2048} />
        </div>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">Sólo HTTPS o un archivo local explícito (file://). Un catálogo cuya firma no corresponde a una clave de confianza no se usa.</p>
        </>}
        </section>
        <section className="space-y-3 rounded-xl border border-[hsl(var(--border))] p-4">
          <h3 className="text-sm font-semibold">Copia local y política de instalación</h3>
          <label className="flex items-center justify-between gap-3 text-sm"><span>Mostrar la última copia verificada si el catálogo no responde</span><Switch checked={allowCachedView} onCheckedChange={setAllowCachedView} aria-label="Mostrar copia verificada sin conexión" /></label>
          <div className="flex items-center justify-between gap-3 text-sm"><Label htmlFor="catalog-max-age">Antigüedad máxima de esa copia (días)</Label><Input id="catalog-max-age" className="w-24 text-center" inputMode="numeric" value={maxCacheAgeDays} onChange={(e) => setMaxCacheAgeDays(e.target.value.replace(/\D/g, "").slice(0, 3))} /></div>
          <div className="flex items-center justify-between gap-3 text-sm"><Label htmlFor="catalog-fresh-hours">Instalar sin confirmación hasta (horas)</Label><Input id="catalog-fresh-hours" className="w-24 text-center" inputMode="numeric" value={installFreshHours} onChange={(e) => setInstallFreshHours(e.target.value.replace(/\D/g, "").slice(0, 3))} /></div>
          <div className="flex items-center justify-between gap-3 text-sm"><Label htmlFor="catalog-max-hours">No instalar con copias de más de (horas)</Label><Input id="catalog-max-hours" className="w-24 text-center" inputMode="numeric" value={installMaxAgeHours} onChange={(e) => setInstallMaxAgeHours(e.target.value.replace(/\D/g, "").slice(0, 3))} /></div>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Si el catálogo no responde, la última copia verificada permite instalar mientras sea reciente; después pide confirmación y, pasado el límite, sólo se puede consultar. Los paquetes siempre se descargan y verifican.</p>
        </section>
        <section className="space-y-1.5">
          <Label htmlFor="catalog-managed-keys">Claves de catálogos administrados (una por línea, Ed25519 SPKI base64)</Label>
          <Textarea id="catalog-managed-keys" className="min-h-20 font-mono text-xs" value={managedKeys} onChange={(e) => setManagedKeys(e.target.value)} />
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Una clave administrada nunca convierte un módulo en «Oficial Runly».</p>
        </section>
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Claves de confianza (trust store)</h3>
          <ul className="divide-y divide-[hsl(var(--border))] rounded-xl border border-[hsl(var(--border))] px-3 text-sm">
            {source.trust.map((key) => (
              <li key={key.keyId} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span className="min-w-0"><code className="text-xs">{key.keyId.slice(0, 16)}…</code> <Badge variant="outline">{DOMAIN_LABELS[key.domain]}</Badge> <Badge variant={key.state === "revoked" ? "destructive" : "secondary"}>{STATE_LABELS[key.state]}</Badge>{key.notAfter && <span className="text-xs text-[hsl(var(--muted-foreground))]"> hasta {new Date(key.notAfter).toLocaleDateString()}</span>}</span>
                {key.state !== "revoked" && <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40" onClick={() => setRevoking(key)}><ShieldOff className="mr-1.5 h-3.5 w-3.5" aria-hidden />Revocar en esta instancia</Button>}
              </li>
            ))}
            {!source.trust.length && <li className="py-1.5 text-xs text-[hsl(var(--muted-foreground))]">Sin claves configuradas.</li>}
          </ul>
        </section>
      </div>
      <DialogFooter className="shrink-0">
        <Button variant="outline" onClick={onDone}>Cancelar</Button>
        <Button disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Guardando..." : "Guardar"}</Button>
      </DialogFooter>
      <ConfirmDialog
        open={Boolean(revoking)}
        onOpenChange={(open) => !open && setRevoking(null)}
        title="Revocar clave en esta instancia"
        description={revoking ? `El contenido firmado con ${revoking.keyId.slice(0, 16)}… dejará de considerarse confiable aquí. Esta acción no se puede deshacer desde la interfaz.` : ""}
        confirmLabel="Revocar"
        loading={revoke.isPending}
        onConfirm={() => revoke.mutate(revoking.keyId)}
      />
    </>
  );
}

export function MarketplaceSourceDialog({ token, onOpenChange }) {
  const source = useQuery({ queryKey: ["module-catalog-v2-source", token], queryFn: async () => (await runly.moduleCatalog.sourceV2(token)).data, enabled: Boolean(token), retry: false });
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-3xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>Origen del catálogo</DialogTitle>
          <DialogDescription>Fuente del Marketplace para toda la instancia. Las claves privadas nunca se configuran en Runly.</DialogDescription>
        </DialogHeader>
        {source.isLoading ? <Skeleton className="h-48 rounded-xl" /> : source.isError ? <ErrorState title="No se pudo leer la configuración" description={source.error?.details?.message ?? source.error?.message} onRetry={() => source.refetch()} /> : <SourceForm source={source.data} token={token} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
