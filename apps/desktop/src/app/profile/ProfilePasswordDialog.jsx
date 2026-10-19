import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  PasswordField,
} from "@runly/ui";
import { KeyRound, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { runly } from "../../lib/runly";

const EMPTY = { currentPassword: "", newPassword: "", confirmPassword: "" };

export function ProfilePasswordDialog({ open, onOpenChange, token }) {
  const [form, setForm] = useState(EMPTY);
  const mismatch = Boolean(form.confirmPassword) && form.newPassword !== form.confirmPassword;

  const mutation = useMutation({
    mutationFn: () => runly.profile.changePassword(form, token),
    onSuccess: () => {
      setForm(EMPTY);
      onOpenChange(false);
      toast.success("Contraseña actualizada", { description: "Tu contraseña se cambió correctamente." });
    },
    onError: (err) => {
      const msg = err?.response?.data?.error ?? "Verifica tu contraseña actual e inténtalo de nuevo.";
      toast.error("No se pudo actualizar la contraseña", { description: msg });
    },
  });

  function handleOpenChange(next) {
    if (mutation.isPending) return;
    if (!next) setForm(EMPTY);
    onOpenChange(next);
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const canSubmit = form.currentPassword && form.newPassword && form.confirmPassword && !mismatch;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="md">
        <DialogHeader icon={KeyRound}>
          <DialogTitle>Cambiar contraseña</DialogTitle>
          <DialogDescription>Ingresa tu contraseña actual y elige una nueva.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <PasswordField label="Contraseña actual" icon={LockKeyhole} value={form.currentPassword} onChange={set("currentPassword")} />
          <PasswordField label="Nueva contraseña" icon={LockKeyhole} showStrength value={form.newPassword} onChange={set("newPassword")} />
          <PasswordField
            label="Confirmar nueva contraseña"
            icon={LockKeyhole}
            value={form.confirmPassword}
            error={mismatch ? "Las contraseñas no coinciden." : undefined}
            onChange={set("confirmPassword")}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Actualizando..." : "Actualizar contraseña"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
