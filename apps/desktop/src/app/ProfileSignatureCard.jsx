import { useState } from "react";
import { Button, Card, ConfirmDialog, Label, SignaturePad, Skeleton, Switch } from "@runly/ui";
import { PenLine, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useSavedSignature } from "../hooks/useSavedSignature.js";

const DELEGATION_LABEL = "Permitir que quien genere resguardos a mi nombre use mi firma guardada";

// "Mi firma": a saved signature other modules can apply on the user's behalf
// (inventory custody records first). Stored as a private PNG on the server.
// Read-only until the user clicks "Editar"; the delegation switch works in both modes.
export function ProfileSignatureCard() {
  const { signature, isLoading, save, setDelegation, remove } = useSavedSignature();
  const [editing, setEditing] = useState(false);
  const [dataUrl, setDataUrl] = useState(null);
  const [draftDelegation, setDraftDelegation] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const allowDelegation = signature ? signature.allowDelegation : draftDelegation;
  const busy = save.isPending || setDelegation.isPending || remove.isPending;

  function stopEditing() {
    setEditing(false);
    setDataUrl(null);
  }

  async function handleSave() {
    try {
      await save.mutateAsync({ dataUrl, allowDelegation });
      stopEditing();
      toast.success("Firma guardada");
    } catch (err) {
      toast.error(err?.message ?? "No se pudo guardar la firma");
    }
  }

  async function handleDelegation(checked) {
    if (!signature) {
      setDraftDelegation(checked);
      return;
    }
    try {
      await setDelegation.mutateAsync(checked);
      toast.success(checked ? "Delegación de firma activada" : "Delegación de firma desactivada");
    } catch (err) {
      toast.error(err?.message ?? "No se pudo actualizar la preferencia");
    }
  }

  async function handleDelete() {
    try {
      await remove.mutateAsync();
      setDeleting(false);
      stopEditing();
      toast.success("Firma eliminada");
    } catch (err) {
      toast.error(err?.message ?? "No se pudo eliminar la firma");
    }
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Mi firma</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Guárdala una vez y aplícala en los documentos que firmas, como los resguardos de equipo.
          </p>
        </div>
        {editing || isLoading ? null : (
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
            <PenLine className="mr-1.5 h-3.5 w-3.5" />{signature ? "Editar" : "Agregar firma"}
          </Button>
        )}
      </div>
      <div className="p-4 md:p-5 space-y-4">
        {isLoading ? (
          <Skeleton className="h-44 w-full" />
        ) : editing ? (
          <SignaturePad
            key={signature?.updatedAt ?? signature?.url ?? "empty"}
            initialImage={signature?.url ?? null}
            onChange={setDataUrl}
            disabled={busy}
            height={170}
          />
        ) : signature?.url ? (
          <div className="flex h-44 items-center justify-center rounded-lg border border-[hsl(var(--border))] bg-white p-3">
            <img src={signature.url} alt="Mi firma guardada" className="max-h-full max-w-full object-contain" />
          </div>
        ) : (
          <div className="flex h-44 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[hsl(var(--border))] text-center">
            <PenLine className="h-5 w-5 text-[hsl(var(--muted-foreground))]" />
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Aún no has guardado tu firma.</p>
          </div>
        )}
        <div className="flex items-start gap-3">
          <Switch
            id="profile-signature-delegation"
            checked={allowDelegation}
            onCheckedChange={handleDelegation}
            disabled={busy || isLoading}
          />
          <div className="space-y-0.5">
            <Label htmlFor="profile-signature-delegation" className="text-sm font-normal leading-snug">{DELEGATION_LABEL}</Label>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Solo quien tenga el permiso para generar resguardos a nombre de otra persona podrá aplicarla, y cada uso queda registrado.
            </p>
          </div>
        </div>
        {editing ? (
          <div className="flex flex-wrap justify-end gap-2 pt-4 border-t border-[hsl(var(--border))]">
            {signature ? (
              <Button type="button" variant="ghost" className="mr-auto text-[hsl(var(--destructive))]" onClick={() => setDeleting(true)} disabled={busy}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />Eliminar firma
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={stopEditing} disabled={busy}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSave} disabled={!dataUrl || busy}>
              {save.isPending ? "Guardando..." : signature ? "Guardar nueva firma" : "Guardar firma"}
            </Button>
          </div>
        ) : null}
      </div>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Eliminar mi firma"
        icon={Trash2}
        description="Ya no podrá aplicarse en documentos nuevos. Los documentos firmados antes no cambian."
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onConfirm={handleDelete}
      />
    </Card>
  );
}
