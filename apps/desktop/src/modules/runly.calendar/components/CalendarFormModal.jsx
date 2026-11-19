import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  TextField,
} from "@runly/ui";
import { useCreateCalendar, useUpdateCalendar } from "../hooks/useCalendarData";
import { CALENDAR_ICONS } from "../calendarIcons";
import { useActiveCompany } from "../../../company/ActiveCompanyProvider";
import { toast } from "sonner";

export const COLORS = [
  "#6366F1",
  "#2563EB",
  "#0EA5E9",
  "#0891B2",
  "#14B8A6",
  "#16A34A",
  "#84CC16",
  "#D97706",
  "#F97316",
  "#DC2626",
  "#EC4899",
  "#DB2777",
  "#A855F7",
  "#7C3AED",
  "#6B46C1",
  "#64748B",
];

const ICON_ENTRIES = Object.entries(CALENDAR_ICONS);

export default function CalendarFormModal({ calendar, onClose }) {
  const isEdit = Boolean(calendar?.id);
  const createCalendar = useCreateCalendar();
  const updateCalendar = useUpdateCalendar();
  const { activeCompany } = useActiveCompany();
  const [name, setName] = useState(calendar?.name ?? "");
  const [color, setColor] = useState(calendar?.color ?? COLORS[0]);
  const [icon, setIcon] = useState(calendar?.icon ?? null);

  useEffect(() => {
    if (calendar) {
      setName(calendar.name);
      setColor(calendar.color);
      setIcon(calendar.icon ?? null);
    }
  }, [calendar?.id]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("El nombre es requerido");
      return;
    }
    try {
      if (isEdit) {
        await updateCalendar.mutateAsync({
          id: calendar.id,
          name: name.trim(),
          color,
          icon,
        });
        toast.success("Calendario actualizado");
      } else {
        await createCalendar.mutateAsync({ name: name.trim(), color, icon });
        toast.success("Calendario creado");
      }
      onClose();
    } catch (err) {
      toast.error(err.message || "Error al guardar");
    }
  }

  const isPending = createCalendar.isPending || updateCalendar.isPending;

  const iconBtnCls = (selected) =>
    [
      "w-10 h-10 rounded-lg flex items-center justify-center transition-all focus-visible:outline-none",
      selected
        ? "ring-2 ring-(--brand-primary)"
        : "hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
    ].join(" ");

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar calendario" : "Nuevo calendario"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <TextField
            label="Nombre"
            required
            placeholder="Mi calendario"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />

          {/* Company — read-only. Assigned automatically from the active
              company at creation (never editable here), so this is purely
              informational: which company this calendar's reminders/events
              are attributed to. */}
          {isEdit ? (
            calendar?.company?.name ? (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Empresa: <span className="font-medium">{calendar.company.name}</span>
              </p>
            ) : (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Calendario personal (sin empresa asignada)
              </p>
            )
          ) : activeCompany?.name ? (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Se asignará a: <span className="font-medium">{activeCompany.name}</span>
            </p>
          ) : null}

          {/* Color picker */}
          <div>
            <div className="text-xs text-[hsl(var(--muted-foreground))] mb-2">
              Color
            </div>
            <div className="grid grid-cols-8 gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-8 h-8 rounded-full transition-all focus-visible:outline-none"
                  style={{
                    backgroundColor: c,
                    border:
                      color === c ? "2px solid white" : "2px solid transparent",
                    transform: color === c ? "scale(1.18)" : "scale(1)",
                    boxShadow: color === c ? `0 0 0 2px ${c}` : "none",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Icon picker */}
          <div>
            <div className="text-xs text-[hsl(var(--muted-foreground))] mb-2">
              Icono
            </div>
            <div className="grid grid-cols-9 gap-1 max-h-52 overflow-y-auto pr-0.5">
              {/* No icon option */}
              <button
                type="button"
                onClick={() => setIcon(null)}
                className={iconBtnCls(!icon)}
                title="Sin icono"
                style={!icon ? { backgroundColor: color + "22", color } : {}}
              >
                <span className="text-xs font-bold leading-none">—</span>
              </button>

              {ICON_ENTRIES.map(([iconName, Icon]) => (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => setIcon(iconName)}
                  className={iconBtnCls(icon === iconName)}
                  title={iconName}
                  style={
                    icon === iconName
                      ? { backgroundColor: color + "22", color }
                      : {}
                  }
                >
                  <Icon size={18} />
                </button>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : isEdit ? "Actualizar" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
