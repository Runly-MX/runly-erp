import { useEffect, useState } from "react";
import {
  Button,
  ComboboxField,
  CreatableComboboxField,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SelectField,
} from "@runly/ui";
import { BellRing, Info } from "lucide-react";
import { toast } from "sonner";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_USERS = 20;
const MAX_EMAILS = 10;

// Who else receives a site's monitor alerts (down, recovered, certificate or domain expiring). Company admins and
// Growth managers always do; here a manager adds company users (no extra permissions) and external addresses.
export function AlertRecipientsDialog({ open, onOpenChange, properties, users, saving, onSave }) {
  const [propertyId, setPropertyId] = useState("");
  const [userIds, setUserIds] = useState([]);
  const [emails, setEmails] = useState([]);
  const property = properties.find((p) => p.id === propertyId) ?? null;

  useEffect(() => {
    if (open) setPropertyId((current) => current || properties[0]?.id || "");
  }, [open, properties]);
  useEffect(() => {
    setUserIds(property?.alertUserIds ?? []);
    setEmails(property?.alertEmails ?? []);
  }, [property]);

  function addEmail(term) {
    const email = String(term ?? "").trim().toLowerCase();
    if (!EMAIL.test(email)) { toast.error("Escribe un correo válido, por ejemplo dueno@minegocio.mx"); return; }
    if (emails.length >= MAX_EMAILS) { toast.error(`Puedes agregar hasta ${MAX_EMAILS} correos externos.`); return; }
    setEmails((current) => (current.includes(email) ? current : [...current, email]));
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <DialogContent size="md" className="flex max-h-[88dvh] flex-col">
        <DialogHeader icon={BellRing}>
          <DialogTitle>Destinatarios de alertas</DialogTitle>
          <DialogDescription>Quién recibe los avisos cuando un sitio se cae, se recupera o tiene un certificado o dominio por vencer.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <div className="flex items-start gap-2 rounded-lg border border-sky-500/25 bg-sky-500/5 p-3 text-sm">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" aria-hidden />
            <p>Los administradores de la empresa y quienes gestionan Growth siempre reciben las alertas. Aquí agregas a más personas para este sitio.</p>
          </div>

          <SelectField
            label="Sitio"
            value={propertyId}
            placeholder="Seleccionar"
            options={properties.map((p) => ({ value: p.id, label: p.name }))}
            onValueChange={setPropertyId}
          />

          <ComboboxField
            label="Usuarios de la empresa"
            hint="Reciben la alerta en Runly y por correo. No necesitan permisos de Growth."
            multiple
            maxChips={6}
            value={userIds}
            onChange={(next) => setUserIds((next ?? []).slice(0, MAX_USERS))}
            options={users.map((u) => ({ value: u.id, label: u.displayName || u.email, description: u.displayName ? u.email : undefined }))}
            placeholder="Buscar usuarios..."
            disabled={!property}
          />

          <CreatableComboboxField
            label="Correos externos"
            hint="Para personas sin cuenta en Runly, por ejemplo el dueño del sitio. Reciben solo el correo, sin enlaces a Runly."
            multiple
            maxChips={6}
            value={emails}
            onChange={(next) => setEmails(next ?? [])}
            options={emails.map((email) => ({ value: email, label: email }))}
            onCreate={addEmail}
            placeholder="Escribe un correo y agrégalo"
            searchPlaceholder="dueno@minegocio.mx"
            disabled={!property}
          />
        </div>

        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button type="submit" disabled={!property || saving} onClick={() => onSave(property.id, { alertUserIds: userIds, alertEmails: emails })}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
