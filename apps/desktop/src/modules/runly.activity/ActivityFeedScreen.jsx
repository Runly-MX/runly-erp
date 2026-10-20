import { toLocalIso } from '../../lib/localDate.js';
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ACTIVITY_MODULES } from "@runly/validators";
import { RunlyTable, PageHeader } from "@runly/ui";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../auth/AuthProvider";
import { useActiveCompany } from "../../company/ActiveCompanyProvider";
import { runly } from "../../lib/runly";
import { getApiUrl } from "../../lib/runtimeConfig.js";
import ActivityDetailSheet from "./ActivityDetailSheet";
import { activityComponentRegistry } from "./ActivityModuleBadge";

const API_BASE_URL = getApiUrl();

const SEVERITY_OPTIONS = [
  { value: "info", label: "Info", color: "#64748b" },
  { value: "success", label: "Éxito", color: "#22c55e" },
  { value: "warning", label: "Advertencia", color: "#f59e0b" },
  { value: "critical", label: "Crítico", color: "#ef4444" },
];

// "Sistema" covers core.* and platform.*; the API expands the core filter.
const MODULE_OPTIONS = ACTIVITY_MODULES.filter((m) => m.key !== "platform").map((m) => ({ value: m.key, label: m.label }));

function buildBlueprint(actorOptions) {
  return {
    key: "activity.list",
    schema: {
      apiPath: "/activity",
      primaryField: "summary",
      searchable: true,
      searchPlaceholder: "Buscar en actividad…",
      defaultViewMode: "table",
      columns: [
        { field: "createdAt", label: "Fecha", type: "date", sortable: true },
        { field: "module", label: "Módulo", sortable: false, component: "ActivityModuleCell" },
        { field: "severity", label: "Severidad", type: "select", sortable: true, options: SEVERITY_OPTIONS },
        { field: "actor.displayName", label: "Usuario", sortable: false },
        { field: "summary", label: "Qué pasó", sortable: false, link: true, isLink: true },
        { field: "entityType", label: "Entidad", sortable: true, defaultVisible: false },
        { field: "type", label: "Tipo de evento", sortable: true, defaultVisible: false },
        { field: "entityId", label: "ID Entidad", sortable: false, defaultVisible: false },
        { field: "source", label: "Origen", sortable: true, defaultVisible: false },
      ],
      filters: [
        { key: "actorId", label: "Usuario", type: "select", options: actorOptions },
        { key: "module", label: "Módulo", type: "select", options: MODULE_OPTIONS },
        { key: "severity", label: "Severidad", type: "select", options: SEVERITY_OPTIONS },
        { key: "date", label: "Fecha", type: "daterange", fromKey: "from", toKey: "to" },
      ],
      emptyState: { message: "Aún no hay actividad para tu empresa." },
    },
  };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 100);
}

export default function ActivityFeedScreen() {
  const { session } = useAuth();
  const token = session?.access_token;
  const { activeCompanyId } = useActiveCompany();
  const navigate = useNavigate();
  const [selected, setSelected] = useState(null);
  const actorsQuery = useQuery({
    queryKey: ["activity", "actors", activeCompanyId],
    queryFn: () => runly.activity.actors(token),
    enabled: Boolean(token && activeCompanyId),
    staleTime: 60_000,
  });
  const blueprint = useMemo(
    () => buildBlueprint((actorsQuery.data?.data ?? []).map((a) => ({ value: a.id, label: a.name }))),
    [actorsQuery.data],
  );

  const bulkActions = useMemo(
    () => [
      {
        label: "Exportar Excel",
        icon: FileSpreadsheet,
        onClick: async (selectedRows) => {
          try {
            const ids = selectedRows.map((row) => row.id).filter(Boolean);
            if (!ids.length) return;
            const blob = await runly.activity.exportExcel({ ids }, token);
            downloadBlob(
              blob,
              `actividad-${toLocalIso()}.xlsx`,
            );
            toast.success("Excel generado");
          } catch {
            toast.error("No se pudo exportar el archivo Excel");
          }
        },
      },
    ],
    [token],
  );

  return (
    <div className="p-4 md:p-6 space-y-6 min-h-dvh">
      <PageHeader
        eyebrow="Runly Activity"
        title="Actividad"
        description="Historial legible de lo que hace tu equipo en cada módulo. Doble clic en una fila para ver el detalle."
      />
      <RunlyTable
        blueprint={blueprint}
        componentRegistry={activityComponentRegistry}
        token={token}
        companyId={activeCompanyId}
        apiBaseUrl={API_BASE_URL}
        onView={setSelected}
        onRowOpen={setSelected}
        bulkActions={bulkActions}
      />
      <ActivityDetailSheet
        activity={selected}
        onClose={() => setSelected(null)}
        onNavigate={(link) => { if (String(link).startsWith("/")) { setSelected(null); navigate(link); } }}
      />
    </div>
  );
}
