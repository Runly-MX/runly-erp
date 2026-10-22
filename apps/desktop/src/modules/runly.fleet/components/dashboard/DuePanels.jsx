import { cn } from "@runly/ui";
import { CalendarClock, IdCard, ShieldCheck } from "lucide-react";
import { Panel } from "../../../runly.inventory/components/dashboard/dashboard-theme.jsx";
import { daysLabel, formatDay } from "../../lib/fleet-status.js";

function dotClass(daysLeft) {
  if (daysLeft < 0) return "bg-red-500";
  return daysLeft <= 14 ? "bg-amber-500" : "bg-sky-500";
}

function DueList({ rows, empty, getKey, getTitle, getSubtitle, onOpen }) {
  if (!rows.length) return <p className="text-sm text-[hsl(var(--muted-foreground))]">{empty}</p>;
  return (
    <ul>
      {rows.map((row) => (
        <li key={getKey(row)}>
          <button
            type="button" onClick={() => onOpen(row)}
            className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--muted))]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          >
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", dotClass(row.daysLeft))} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{getTitle(row)}</span>
              <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">{getSubtitle(row)}</span>
            </span>
            <span className={cn("shrink-0 text-xs tabular-nums", row.daysLeft < 0 ? "font-medium text-red-600 dark:text-red-400" : "text-[hsl(var(--muted-foreground))]")}>
              {daysLabel(row.daysLeft)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// Three upcoming-deadline lists: next services, insurance and driver licences.
export function DuePanels({ data, go }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      <Panel title="Proximos mantenimientos" subtitle="Segun el ultimo reporte de cada unidad" icon={CalendarClock} tone="#0d9488">
        <DueList
          rows={data.maintenanceDue} empty="Ningun mantenimiento programado en los proximos 45 dias."
          getKey={(r) => r.reportId} getTitle={(r) => r.plate} getSubtitle={(r) => formatDay(r.nextServiceDate)}
          onOpen={(r) => go(`/vehicles/${r.vehicleId}`)}
        />
      </Panel>
      <Panel
        title="Seguros por vencer" icon={ShieldCheck} tone="#2563eb"
        subtitle={data.insurance.uncovered ? `${data.insurance.uncovered} sin poliza` : "Todas las unidades con poliza"}
      >
        <DueList
          rows={data.insurance.upcoming} empty="No hay polizas por vencer en 30 dias."
          getKey={(r) => `${r.vehicleId}-${r.expiryDate}`} getTitle={(r) => r.plate}
          getSubtitle={(r) => `${r.insurer ?? "Poliza"} · ${formatDay(r.expiryDate)}`}
          onOpen={(r) => go(`/vehicles/${r.vehicleId}`)}
        />
      </Panel>
      <Panel
        title="Licencias por vencer" icon={IdCard} tone="#d97706"
        subtitle={data.assignment.driversWithoutVehicle ? `${data.assignment.driversWithoutVehicle} choferes sin unidad` : "Choferes activos"}
        className="lg:col-span-2 xl:col-span-1"
      >
        <DueList
          rows={data.licenses.upcoming} empty="No hay licencias por vencer en 30 dias."
          getKey={(r) => r.driverId} getTitle={(r) => r.name} getSubtitle={(r) => formatDay(r.expiryDate)}
          onOpen={(r) => go(`/drivers/${r.driverId}`)}
        />
      </Panel>
    </div>
  );
}
