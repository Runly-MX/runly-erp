import { useEffect, useState } from "react";
import {
  Button,
  CheckboxField,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SelectField,
  TextField,
} from "@runly/ui";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const publicUrl = (slug) => `${window.location.origin}/app/p/status/${slug}`;

// Publish or hide the anonymous status page of a site and copy its link.
export function StatusPageDialog({ open, onOpenChange, properties, pages, saving, onSave, onRegenerate }) {
  const [propertyId, setPropertyId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState("");

  const page = pages.find((p) => p.propertyId === propertyId) ?? null;

  useEffect(() => {
    if (open) setPropertyId(properties[0]?.id ?? "");
  }, [open, properties]);
  useEffect(() => {
    setEnabled(Boolean(page?.enabled));
    setTitle(page?.title ?? properties.find((p) => p.id === propertyId)?.name ?? "");
  }, [page, propertyId, properties]);

  const copy = () =>
    navigator.clipboard
      .writeText(publicUrl(page.slug))
      .then(() => toast.success("Enlace copiado"))
      .catch(() => toast.error("Selecciona el enlace y copialo manualmente"));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pagina de estado publica</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Una pagina que cualquiera con el enlace puede ver, sin iniciar sesion. Muestra el nombre de cada monitor, su estado y los incidentes de 30 dias. No muestra direcciones, errores tecnicos ni datos internos.
          </p>
          <SelectField
            label="Sitio"
            value={propertyId}
            placeholder="Seleccionar"
            options={properties.map((p) => ({ value: p.id, label: p.name }))}
            onValueChange={setPropertyId}
          />
          <TextField label="Titulo de la pagina" value={title} onChange={(e) => setTitle(e.target.value)} />
          <CheckboxField
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            label="Publicar la pagina"
            hint="Los nombres de tus monitores seran publicos; revisalos antes de compartir el enlace."
          />
          {page ? (
            <div className="space-y-2">
              <TextField label="Enlace publico" value={publicUrl(page.slug)} readOnly />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={copy}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Copiar
                </Button>
                {page.enabled ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => window.open(publicUrl(page.slug), "_blank", "noopener")}>
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    Abrir
                  </Button>
                ) : null}
                <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => onRegenerate(propertyId)}>
                  Generar enlace nuevo
                </Button>
              </div>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Al generar un enlace nuevo, el anterior deja de funcionar.</p>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button type="button" disabled={saving || !propertyId || !title.trim()} onClick={() => onSave(propertyId, { enabled, title: title.trim() })}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
