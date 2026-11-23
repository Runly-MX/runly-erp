import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RunlyTable,
  Button,
  ErrorState,
  PageHeader,
  StatCard,
  useIsMobile,
} from "@runly/ui";
import {
  CircleCheckBig,
  Clock3,
  UserPlus,
  UserRoundSearch,
  UsersRound,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useAuth } from "../../../auth/AuthProvider.jsx";
import { useActiveCompany } from "../../../company/ActiveCompanyProvider";
import { runly } from "../../../lib/runly.js";
import { getApiUrl } from "../../../lib/runtimeConfig.js";
import { componentRegistry } from "../../../lib/moduleComponentRegistry.js";
import { CreateLeadDialog } from "../components/CreateLeadDialog.jsx";
import {
  LEAD_PRIORITY_OPTIONS,
  LEAD_STATUS_OPTIONS,
} from "../lib/growth-leads.js";

const API_BASE_URL = getApiUrl();

const LEADS_BLUEPRINT = {
  key: "growth.leads.table",
  schema: {
    apiPath: "/growth/leads",
    primaryField: "name",
    searchable: true,
    searchPlaceholder: "Buscar por nombre, correo, telefono o empresa...",
    columns: [
      { field: "name", label: "Lead", sortable: true, link: true },
      {
        field: "status",
        label: "Estado",
        sortable: true,
        type: "select",
        options: LEAD_STATUS_OPTIONS,
        component: "runly.growth:LeadStatusBadge",
      },
      {
        field: "priority",
        label: "Prioridad",
        sortable: false,
        type: "select",
        options: LEAD_PRIORITY_OPTIONS,
        component: "runly.growth:LeadPriorityBadge",
        defaultVisible: false,
      },
      { field: "email", label: "Correo", sortable: false, defaultVisible: false },
      { field: "phone", label: "Telefono", sortable: false, defaultVisible: false },
      { field: "companyName", label: "Empresa", sortable: false, defaultVisible: false },
      { field: "source", label: "Fuente", sortable: false, defaultVisible: false },
      { field: "assignedToName", label: "Asignado a", sortable: false, defaultVisible: false },
      { field: "createdAt", label: "Entrada", type: "date", sortable: true },
    ],
    filters: [
      { key: "status", label: "Estado", type: "select", options: LEAD_STATUS_OPTIONS },
      { key: "priority", label: "Prioridad", type: "select", options: LEAD_PRIORITY_OPTIONS },
    ],
    emptyState: { message: "No hay leads registrados." },
  },
};

export default function GrowthLeadsScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, userProfile } = useAuth();
  const token = session?.access_token;
  const { activeCompanyId } = useActiveCompany();
  const permissions = userProfile?.permissions ?? [];
  const hasPermission = (key) =>
    Boolean(userProfile?.isAdmin || permissions.includes(key));
  const canRead = hasPermission("growth.leads.read");
  const canCreate = hasPermission("growth.leads.create");
  const isMobile = useIsMobile();
  // Phones open on cards; a view the user picked is remembered and wins.
  const blueprint = useMemo(
    () => ({ ...LEADS_BLUEPRINT, schema: { ...LEADS_BLUEPRINT.schema, defaultViewMode: isMobile ? "cards" : "table" } }),
    [isMobile],
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);

  const summaryQuery = useQuery({
    queryKey: ["growth", "leads", "summary"],
    queryFn: () => runly.growth.getLeadSummary(token),
    enabled: Boolean(token && canRead),
  });

  const createMutation = useMutation({
    mutationFn: (payload) => runly.growth.createLead(payload, token),
    onSuccess: async () => {
      setCreateOpen(false);
      setRefreshSignal((s) => s + 1);
      await queryClient.invalidateQueries({ queryKey: ["growth", "leads", "summary"] });
      toast.success("Lead creado");
    },
    onError: (error) =>
      toast.error(error?.message || "No se pudo crear el lead"),
  });

  if (!canRead) {
    return (
      <div className="min-h-dvh p-4 md:p-6">
        <PageHeader eyebrow="Runly Growth" title="Leads" />
        <ErrorState message="No tienes permisos para consultar leads." />
      </div>
    );
  }

  const summary = summaryQuery.data?.data ?? {};

  return (
    <div className="min-h-dvh space-y-6 p-4 md:p-6">
      <PageHeader
        eyebrow="Runly Growth"
        title="Leads"
        description="Clasifica, asigna y convierte las consultas recibidas desde tu sitio web."
        actions={
          canCreate ? (
            <Button onClick={() => setCreateOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Nuevo lead
            </Button>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total"
          value={summary.total ?? 0}
          icon={UsersRound}
          loading={summaryQuery.isLoading}
        />
        <StatCard
          label="Nuevos"
          value={summary.new ?? 0}
          icon={UserRoundSearch}
          loading={summaryQuery.isLoading}
        />
        <StatCard
          label="En seguimiento"
          value={summary.followUp ?? 0}
          icon={Clock3}
          loading={summaryQuery.isLoading}
        />
        <StatCard
          label="Convertidos"
          value={summary.converted ?? 0}
          icon={CircleCheckBig}
          loading={summaryQuery.isLoading}
        />
      </div>

      <RunlyTable
        blueprint={blueprint}
        token={token}
        companyId={activeCompanyId}
        apiBaseUrl={API_BASE_URL}
        componentRegistry={componentRegistry}
        onView={(row) => navigate(`/app/m/runly.growth/leads/${row.id}`)}
        refreshSignal={refreshSignal}
      />

      <CreateLeadDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(payload) => createMutation.mutate(payload)}
        loading={createMutation.isPending}
      />
    </div>
  );
}
