import { useNavigate } from "react-router-dom";
import { Button, ErrorState, PageHeader } from "@runly/ui";
import { ClipboardList, Plus, Truck } from "lucide-react";
import { useAuth } from "../../../auth/AuthProvider";
import { VIZ_VARS } from "../../runly.inventory/components/dashboard/dashboard-theme.jsx";
import { useFleetDashboard } from "../hooks/useFleetDashboard.js";
import { useFleetLive } from "../hooks/useFleetLive.js";
import { FleetHero } from "../components/dashboard/FleetHero.jsx";
import { InsightsPanel } from "../components/dashboard/InsightsPanel.jsx";
import { SpendPanel } from "../components/dashboard/SpendPanel.jsx";
import { DuePanels } from "../components/dashboard/DuePanels.jsx";

const BASE = "/app/m/runly.fleet";

// Module landing page: status hero, ranked smart alerts, spend, and the
// deadlines that need action (services, insurance, licences).
export default function FleetSummaryScreen() {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const { data, isLoading, isError, refetch } = useFleetDashboard(12);
  useFleetLive();
  const can = (key) => Boolean(userProfile?.isAdmin || userProfile?.permissions?.includes(key));
  const go = (path) => navigate(`${BASE}${path}`);

  if (isError) {
    return (
      <div className="min-h-dvh p-4 md:p-6">
        <ErrorState title="No se pudo cargar el resumen" description="Revisa tu conexión y vuelve a intentar." onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className={`min-h-dvh space-y-5 p-4 md:p-6 ${VIZ_VARS}`}>
      <PageHeader
        eyebrow="Runly Fleet"
        title="Resumen de flota"
        description="Estado de tus unidades, vencimientos y lo que necesita atención."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => go("/vehicles")}><Truck className="mr-2 h-4 w-4" />Vehículos</Button>
            {can("fleet.reports.create") ? (
              <Button variant="outline" onClick={() => go("/reports/maintenance/new")}><ClipboardList className="mr-2 h-4 w-4" />Nuevo reporte</Button>
            ) : null}
            {can("fleet.vehicles.create") ? (
              <Button onClick={() => go("/vehicles/new")}><Plus className="mr-2 h-4 w-4" />Nuevo vehículo</Button>
            ) : null}
          </div>
        }
      />

      <FleetHero data={data} isLoading={isLoading} onSelect={() => go("/vehicles")} />
      <InsightsPanel insights={data?.insights} isLoading={isLoading} />

      {data ? (
        <>
          <SpendPanel reports={data.reports} topCostVehicles={data.topCostVehicles} onOpenVehicle={(id) => go(`/vehicles/${id}`)} />
          <DuePanels data={data} go={go} />
        </>
      ) : null}
    </div>
  );
}
