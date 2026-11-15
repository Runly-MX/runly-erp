import { useEffect, useState } from "react";
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, SelectField } from "@runly/ui";

const OPTIONS = [
  { value: "60", label: "1 hora" },
  { value: "240", label: "4 horas" },
  { value: "1440", label: "24 horas" },
  { value: "off", label: "Terminar mantenimiento" },
];

export function MonitorMaintenanceDialog({ open, onOpenChange, monitor, saving, onSave }) {
  const [value, setValue] = useState("60");
  useEffect(() => {
    if (open) setValue(monitor?.config?.maintenanceUntil ? "off" : "60");
  }, [open, monitor]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mantenimiento de {monitor?.name ?? "monitor"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Durante el mantenimiento no revisamos este monitor ni enviamos alertas. Util al desplegar o migrar el sitio.
          </p>
          <SelectField label="Duracion" value={value} options={OPTIONS} onValueChange={setValue} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={saving} onClick={() => onSave(value === "off" ? null : Number(value))}>
            {saving ? "Guardando..." : "Aplicar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
