// Code trust of an installed custom module (F1B): whether its code may run,
// why not, and how to recover it. Only the platform owner sees the approve /
// quarantine actions; the API is the authority (POST /modules/:key/trust).
// Quarantine never touches the module's data or company settings.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, ConfirmDialog } from "@runly/ui";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { runly } from "../../../lib/runly";

const REASONS = {
  NO_TRUST_RECORD: "Se instaló antes del control de código o sin una fuente autorizada.",
  CODE_CHANGED_SINCE_TRUSTED: "Sus archivos cambiaron en el servidor después de autorizarse.",
  SYMLINK_IN_PACKAGE: "El paquete contiene enlaces simbólicos, que no se permiten.",
  UNSUPPORTED_FILE_IN_PACKAGE: "El paquete contiene archivos especiales no permitidos.",
  QUARANTINED_BY_OWNER: "El propietario de la plataforma lo puso en cuarentena.",
  QUARANTINED_BY_OPERATOR: "Un operador del servidor lo puso en cuarentena.",
};
const AUTHORITIES = {
  "builder-compiler": "Generado por el Constructor",
  "runly-official-signature": "Catálogo oficial de Runly",
  "platform-owner": "Subido por el propietario de la plataforma",
  "platform-owner-review": "Aprobado por el propietario tras revisión",
  "operator-review": "Aprobado por un operador del servidor",
};

export function ModuleTrustSection({ moduleKey, token, isPlatformOwner, fromBuilder = false }) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(null);
  const query = useQuery({
    queryKey: ["module-trust", moduleKey],
    queryFn: async () => {
      const result = await runly.modules.getModuleTrust(moduleKey, token);
      return result?.error ? null : result?.data ?? null;
    },
    enabled: Boolean(token && moduleKey),
    retry: false,
  });
  const decide = useMutation({
    mutationFn: async (decision) => {
      const result = await runly.modules.decideModuleTrust(moduleKey, decision, token);
      if (result?.error) throw new Error(result.message ?? result.error);
      return result.data;
    },
    onSuccess: (data) => {
      toast.success(data.state === "trusted" ? "Módulo aprobado" : "Módulo en cuarentena");
      queryClient.invalidateQueries({ queryKey: ["module-trust", moduleKey] });
      queryClient.invalidateQueries({ queryKey: ["modules"] });
    },
    onError: (error) => toast.error("No se pudo cambiar la confianza del módulo", { description: error.message }),
  });

  const trust = query.data;
  if (!trust) return null;
  const trusted = trust.state === "trusted";
  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        {trusted ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4 text-amber-600" />} Código del módulo
        <Badge variant={trusted ? "secondary" : "outline"} className="text-xs">{trusted ? "De confianza" : "En cuarentena"}</Badge>
      </h3>
      {trusted ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">{AUTHORITIES[trust.authority] ?? "Autorizado"}.</p>
      ) : (
        <div className="space-y-2 rounded-xl border border-amber-300/60 bg-amber-50/60 px-3 py-2 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
          <p>Su código no se ejecuta. {REASONS[trust.reason] ?? "No tiene una autorización válida."} Sus datos y su configuración por empresa se conservan.</p>
          <p className="text-[hsl(var(--muted-foreground))]">
            {fromBuilder
              ? "Para recuperarlo, vuelve a publicarlo desde el Constructor."
              : isPlatformOwner
                ? "Revisa su código en el servidor antes de aprobarlo, o reinstálalo desde el catálogo oficial."
                : "Solo el propietario de la plataforma puede revisarlo y aprobarlo, o reinstalarlo desde el catálogo oficial."}
          </p>
        </div>
      )}
      {isPlatformOwner && (
        <div className="flex flex-wrap gap-2">
          {!trusted && <Button type="button" size="sm" variant="outline" onClick={() => setPending("approve")} disabled={decide.isPending}>Aprobar después de revisar</Button>}
          {trusted && <Button type="button" size="sm" variant="ghost" onClick={() => setPending("quarantine")} disabled={decide.isPending}>Poner en cuarentena</Button>}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(pending)}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending === "approve" ? "Aprobar el código del módulo" : "Poner el módulo en cuarentena"}
        description={pending === "approve"
          ? "El código que está ahora en el servidor se ejecutará para todas las empresas de la instancia. Apruébalo solo si revisaste sus archivos."
          : "Su código dejará de ejecutarse de inmediato. Los datos y la configuración de las empresas no se tocan."}
        confirmLabel={pending === "approve" ? "Aprobar" : "Poner en cuarentena"}
        onConfirm={() => { decide.mutate(pending); setPending(null); }}
      />
    </div>
  );
}
