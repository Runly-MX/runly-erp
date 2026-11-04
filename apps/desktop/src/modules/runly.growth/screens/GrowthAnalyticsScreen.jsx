import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  DatePickerField,
  EmptyState,
  ErrorState,
  Label,
  LoadingState,
  PageHeader,
  SelectField,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@runly/ui";
import { Download, TrendingUp } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { useAuth } from "../../../auth/AuthProvider.jsx";
import { runly } from "../../../lib/runly.js";
import { GrowthAnalyticsReport } from "../components/GrowthAnalyticsReports.jsx";
import {
  ANALYTICS_RANGE_OPTIONS,
  ANALYTICS_TABS,
  buildAnalyticsQuery,
  resolveAnalyticsFilters,
} from "../lib/growth-analytics.js";

const REPORT_LOADERS = {
  overview: (token, query) => runly.growth.getAnalyticsOverview(token, query),
  acquisition: (token, query) =>
    runly.growth.getAnalyticsAcquisition(token, query),
  content: (token, query) => runly.growth.getAnalyticsContent(token, query),
  conversions: (token, query) =>
    runly.growth.getAnalyticsConversions(token, query),
  retention: (token, query) =>
    runly.growth.getAnalyticsRetention(token, query),
};

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function GrowthAnalyticsScreen() {
  const { session, userProfile } = useAuth();
  const token = session?.access_token;
  const permissions = userProfile?.permissions ?? [];
  const canRead = Boolean(
    userProfile?.isAdmin || permissions.includes("growth.analytics.read"),
  );
  const canExport = Boolean(
    userProfile?.isAdmin || permissions.includes("growth.analytics.export"),
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(
    () => resolveAnalyticsFilters(searchParams),
    [searchParams],
  );
  const query = useMemo(() => buildAnalyticsQuery(filters), [filters]);

  const {
    data: sitesResponse,
    isLoading: sitesLoading,
  } = useQuery({
    queryKey: ["growth", "analytics", "sites"],
    queryFn: () => runly.growth.listAnalyticsSites(token),
    enabled: Boolean(token && canRead),
    staleTime: 5 * 60_000,
  });

  const {
    data: reportResponse,
    isLoading: reportLoading,
    isError: reportIsError,
    error: reportError,
    refetch: refetchReport,
  } = useQuery({
    queryKey: [
      "growth",
      "analytics",
      filters.tab,
      filters.from,
      filters.to,
      filters.siteId,
      filters.compare,
    ],
    queryFn: () => REPORT_LOADERS[filters.tab](token, query),
    enabled: Boolean(token && canRead),
  });

  function updateFilters(patch) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === "" || value == null || value === false) {
        next.delete(key);
      } else {
        next.set(key, String(value));
      }
    }
    if (patch.range && patch.range !== "custom") {
      next.delete("from");
      next.delete("to");
    }
    setSearchParams(next, { replace: true });
  }

  async function handleExport() {
    try {
      const blob = await runly.growth.exportAnalyticsCsv(token, {
        ...query,
        report: filters.tab,
      });
      downloadBlob(blob, `growth-${filters.tab}-${filters.from}-${filters.to}.csv`);
    } catch (error) {
      toast.error(error?.message || "No se pudo exportar la analitica");
    }
  }

  if (!canRead) {
    return (
      <div className="min-h-dvh p-4 md:p-6">
        <PageHeader eyebrow="Runly Growth" title="Analitica web" />
        <ErrorState description="No tienes permisos para consultar la analitica web." />
      </div>
    );
  }

  const sites = sitesResponse?.data ?? [];
  const siteOptions = [
    { value: "__all__", label: "Todos los sitios" },
    ...sites.map((site) => ({
      value: site.id,
      label: site.domain ? `${site.name} - ${site.domain}` : site.name,
    })),
  ];
  const reportData = reportResponse?.data ?? null;

  return (
    <div className="min-h-dvh space-y-6 p-4 md:p-6">
      <PageHeader
        eyebrow="Runly Growth"
        title="Analitica web"
        description="Mide adquisicion, contenido, formularios, conversion y retencion del storefront publicado."
        actions={
          canExport ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleExport}
              disabled={reportLoading}
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 md:grid-cols-2 xl:grid-cols-[180px_240px_1fr]">
        <SelectField
          label="Periodo"
          value={filters.range}
          options={ANALYTICS_RANGE_OPTIONS}
          onValueChange={(range) => updateFilters({ range })}
        />
        <SelectField
          label="Sitio"
          value={filters.siteId || "__all__"}
          options={siteOptions}
          disabled={sitesLoading}
          onValueChange={(siteId) =>
            updateFilters({ siteId: siteId === "__all__" ? "" : siteId })
          }
        />
        <div className="flex items-end">
          <div className="flex h-11 w-full items-center justify-between rounded-lg border border-[hsl(var(--border))] px-3.5">
            <div>
              <Label htmlFor="growth-analytics-compare">
                Comparar periodo anterior
              </Label>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Mismo numero de dias
              </p>
            </div>
            <Switch
              id="growth-analytics-compare"
              checked={filters.compare}
              onCheckedChange={(compare) => updateFilters({ compare })}
            />
          </div>
        </div>
        {filters.range === "custom" ? (
          <>
            <DatePickerField
              label="Desde"
              value={filters.from}
              onChange={(from) => updateFilters({ from })}
            />
            <DatePickerField
              label="Hasta"
              value={filters.to}
              onChange={(to) => updateFilters({ to })}
            />
          </>
        ) : null}
      </div>

      <Tabs
        value={filters.tab}
        onValueChange={(tab) => updateFilters({ tab })}
      >
        <div className="overflow-x-auto pb-1">
          <TabsList className="min-w-max">
            {ANALYTICS_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {reportLoading ? (
        <LoadingState message="Cargando analitica..." />
      ) : reportIsError ? (
        <ErrorState
          title="No se pudo cargar la analitica"
          description={reportError?.message}
          onRetry={() => refetchReport()}
        />
      ) : reportData ? (
        <GrowthAnalyticsReport report={filters.tab} data={reportData} />
      ) : (
        <EmptyState
          icon={TrendingUp}
          title="Aún no hay métricas para mostrar"
          description="En cuanto tu sitio reciba visitas, verás aquí de dónde llegan y qué hacen."
        />
      )}
    </div>
  );
}
