// Platform owner card + transfer flow (runly.core settings).
// Spec: docs/superpowers/specs/2026-10-18-platform-owner-design.md §7
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  ComboboxField,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from "@runly/ui";
import { Crown, ShieldAlert, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";
import { PLATFORM_OWNER_QUERY_KEY } from "../lib/usePlatformOwner";

export function InstanceScopeAlert({ owner }) {
  const name = owner?.displayName || "el propietario de la plataforma";
  return (
    <Alert variant="warning">
      <ShieldAlert className="h-4 w-4" />
      <AlertDescription>
        Estos ajustes afectan a todas las empresas de la instancia. Solo {name} puede cambiarlos.
      </AlertDescription>
    </Alert>
  );
}

function TransferOwnerDialog({ open, onOpenChange, currentOwnerId }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const queryClient = useQueryClient();
  const [profileId, setProfileId] = useState("");
  const [confirming, setConfirming] = useState(false);

  const candidatesQuery = useQuery({
    queryKey: ["platform-owner-candidates"],
    queryFn: () => runly.identity.listCandidates(token, { pageSize: 100 }),
    enabled: Boolean(open && token),
  });
  const options = useMemo(
    () => (candidatesQuery.data?.data ?? [])
      .filter((user) => user.id !== currentOwnerId)
      .map((user) => ({ value: user.id, label: user.displayName || `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() })),
    [candidatesQuery.data, currentOwnerId],
  );
  const selectedLabel = options.find((option) => option.value === profileId)?.label ?? "";

  const transfer = useMutation({
    mutationFn: () => runly.platform.transferOwner(profileId, token),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PLATFORM_OWNER_QUERY_KEY });
      toast.success("Propiedad de la plataforma transferida");
      setConfirming(false);
      setProfileId("");
      onOpenChange(false);
    },
    onError: (error) => toast.error("No se pudo transferir la propiedad", { description: error.message }),
  });

  return (
    <>
      <Dialog open={open && !confirming} onOpenChange={onOpenChange}>
        <DialogContent size="md">
          <DialogHeader icon={Crown}>
            <DialogTitle>Transferir propiedad</DialogTitle>
            <DialogDescription>
              Elige a la persona que administrará los ajustes de toda la instancia.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <ComboboxField
              label="Nuevo propietario"
              icon={UserRound}
              options={options}
              value={profileId}
              onChange={(value) => setProfileId(value ?? "")}
              placeholder={candidatesQuery.isLoading ? "Cargando usuarios..." : "Seleccionar usuario"}
              searchPlaceholder="Buscar usuario..."
              emptyText="No se encontraron usuarios"
            />
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Solo aparecen usuarios activos de esta empresa.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button disabled={!profileId} onClick={() => setConfirming(true)}>Continuar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirming}
        onOpenChange={(next) => { if (!next) setConfirming(false); }}
        icon={Crown}
        tone="warning"
        title="Confirmar transferencia"
        description={`${selectedLabel} será el propietario de la plataforma. Perderás la capacidad de cambiar los ajustes de la instancia y Web Push para todas las empresas, y solo esa persona podrá devolverte la propiedad.`}
        confirmLabel="Transferir propiedad"
        loading={transfer.isPending}
        onConfirm={() => transfer.mutate()}
      />
    </>
  );
}

export function PlatformOwnerCard({ owner, isOwner, multiCompany, isLoading }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="p-0">
      <div className="px-4 py-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 rounded-t-2xl">
        <p className="text-sm font-semibold">Propietario de la plataforma</p>
      </div>
      <div className="p-4 flex flex-wrap items-center justify-between gap-3">
        {isLoading ? (
          <Skeleton className="h-10 w-56" />
        ) : (
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary" aria-hidden="true">
              <Crown className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {owner?.displayName ?? "Sin propietario asignado"}
                {isOwner && <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">(tú)</span>}
              </p>
              {owner?.email && <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{owner.email}</p>}
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                {multiCompany
                  ? "Administra los ajustes que comparten todas las empresas de la instancia."
                  : "Con una sola empresa, sus administradores también pueden cambiar estos ajustes."}
              </p>
            </div>
          </div>
        )}
        {isOwner && (
          <Button variant="outline" onClick={() => setOpen(true)}>Transferir propiedad</Button>
        )}
      </div>
      {isOwner && <TransferOwnerDialog open={open} onOpenChange={setOpen} currentOwnerId={owner?.id} />}
    </Card>
  );
}
