import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  StatCard,
} from "@runly/ui";
import {
  Activity,
  Clock3,
  Eye,
  MousePointerClick,
  Route,
  Target,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  formatAnalyticsNumber,
  formatAnalyticsPercent,
} from "../lib/growth-analytics.js";

const COLORS = {
  primary: "#7c3aed",
  secondary: "#0ea5e9",
  success: "#16a34a",
  warning: "#f59e0b",
};

const acquisitionColumns = [
  { accessorKey: "source", header: "Fuente" },
  { accessorKey: "medium", header: "Medio" },
  { accessorKey: "campaign", header: "Campana" },
  {
    accessorKey: "sessions",
    header: "Sesiones",
    cell: ({ getValue }) => formatAnalyticsNumber(getValue()),
  },
  {
    accessorKey: "engagedSessions",
    header: "Comprometidas",
    cell: ({ getValue }) => formatAnalyticsNumber(getValue()),
  },
  {
    accessorKey: "conversionRate",
    header: "Conversion",
    cell: ({ getValue }) => formatAnalyticsPercent(getValue()),
  },
];

const landingColumns = [
  { accessorKey: "path", header: "Pagina de entrada" },
  {
    accessorKey: "sessions",
    header: "Sesiones",
    cell: ({ getValue }) => formatAnalyticsNumber(getValue()),
  },
  {
    accessorKey: "engagedSessions",
    header: "Comprometidas",
    cell: ({ getValue }) => formatAnalyticsNumber(getValue()),
  },
  {
    accessorKey: "conversionRate",
    header: "Conversion",
    cell: ({ getValue }) => formatAnalyticsPercent(getValue()),
  },
];

const pageColumns = [
  { accessorKey: "path", header: "Ruta" },
  {
    accessorKey: "pageviews",
    header: "Vistas",
    cell: ({ getValue }) => formatAnalyticsNumber(getValue()),
  },
  {
    accessorKey: "visitors",
    header: "Visitantes",
    cell: ({ getValue }) => formatAnalyticsNumber(getValue()),
  },
];

const ctaColumns = [
  { accessorKey: "label", header: "CTA" },
  { accessorKey: "placement", header: "Ubicacion" },
  {
    accessorKey: "clicks",
    header: "Clics",
    cell: ({ getValue }) => formatAnalyticsNumber(getValue()),
  },
  {
    accessorKey: "visitors",
    header: "Visitantes",
    cell: ({ getValue }) => formatAnalyticsNumber(getValue()),
  },
  {
    accessorKey: "ctr",
    header: "CTR",
    cell: ({ getValue }) => formatAnalyticsPercent(getValue()),
  },
];

const formColumns = [
  { accessorKey: "formId", header: "Formulario" },
  {
    accessorKey: "views",
    header: "Vistas",
    cell: ({ getValue }) => formatAnalyticsNumber(getValue()),
  },
  {
    accessorKey: "starts",
    header: "Inicios",
    cell: ({ getValue }) => formatAnalyticsNumber(getValue()),
  },
  {
    accessorKey: "submits",
    header: "Envios",
    cell: ({ getValue }) => formatAnalyticsNumber(getValue()),
  },
  {
    accessorKey: "completionRate",
    header: "Finalizacion",
    cell: ({ getValue }) => formatAnalyticsPercent(getValue()),
  },
];

const funnelColumns = [
  { accessorKey: "label", header: "Paso" },
  {
    accessorKey: "count",
    header: "Personas",
    cell: ({ getValue }) => formatAnalyticsNumber(getValue()),
  },
];

const retentionColumns = [
  { accessorKey: "cohortDate", header: "Cohorte" },
  {
    accessorKey: "cohortVisitors",
    header: "Visitantes",
    cell: ({ getValue }) => formatAnalyticsNumber(getValue()),
  },
  {
    accessorKey: "d1Rate",
    header: "D1",
    cell: ({ getValue }) => formatAnalyticsPercent(getValue()),
  },
  {
    accessorKey: "d7Rate",
    header: "D7",
    cell: ({ getValue }) => formatAnalyticsPercent(getValue()),
  },
  {
    accessorKey: "d30Rate",
    header: "D30",
    cell: ({ getValue }) => formatAnalyticsPercent(getValue()),
  },
];

const campaignColumns = [
  { accessorKey: "campaign", header: "Campana" },
  { accessorKey: "source", header: "Fuente" },
  {
    accessorKey: "sessions",
    header: "Sesiones",
    cell: ({ getValue }) => formatAnalyticsNumber(getValue()),
  },
  {
    accessorKey: "conversions",
    header: "Conversiones",
    cell: ({ getValue }) => formatAnalyticsNumber(getValue()),
  },
  {
    accessorKey: "conversionRate",
    header: "Tasa",
    cell: ({ getValue }) => formatAnalyticsPercent(getValue()),
  },
];

function ReportCard({ title, description, children }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function EmptyChart() {
  return (
    <EmptyState
      icon={Activity}
      title="Todavía no hay movimiento en este periodo"
      description="Prueba con un rango de fechas más amplio, o revisa que tu sitio esté enviando visitas."
    />
  );
}

function OverviewReport({ data }) {
  const totals = data.totals ?? {};
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Visitantes"
          value={formatAnalyticsNumber(totals.visitors)}
          icon={UsersRound}
          trend={data.deltas?.visitors?.percent}
        />
        <StatCard
          label="Sesiones"
          value={formatAnalyticsNumber(totals.sessions)}
          icon={Route}
          trend={data.deltas?.sessions?.percent}
        />
        <StatCard
          label="Rebote"
          value={formatAnalyticsPercent(totals.bounceRate)}
          icon={Clock3}
          trend={
            data.deltas?.bounceRate?.percent == null
              ? null
              : -data.deltas.bounceRate.percent
          }
        />
        <StatCard
          label="Conversion"
          value={formatAnalyticsPercent(totals.conversionRate)}
          icon={Target}
          trend={data.deltas?.conversionRate?.percent}
        />
      </div>

      <ReportCard
        title="Actividad diaria"
        description="Sesiones y vistas de pagina recibidas por dia."
      >
        {data.series?.length ? (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={data.series}>
              <defs>
                <linearGradient id="growthSessions" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Area
                type="monotone"
                dataKey="sessions"
                name="Sesiones"
                stroke={COLORS.primary}
                fill="url(#growthSessions)"
              />
              <Area
                type="monotone"
                dataKey="pageviews"
                name="Vistas"
                stroke={COLORS.secondary}
                fillOpacity={0}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart />
        )}
      </ReportCard>
    </div>
  );
}

function AcquisitionReport({ data }) {
  return (
    <div className="space-y-6">
      <ReportCard title="Sesiones por fuente">
        {data.rows?.length ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.rows.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="source" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="sessions" name="Sesiones" fill={COLORS.primary} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart />
        )}
      </ReportCard>
      <DataTable
        columns={funnelColumns}
        data={data.funnel ?? []}
        searchPlaceholder="Buscar paso del embudo..."
        emptyTitle="Sin actividad en el embudo"
        emptyDescription="Los pasos apareceran cuando existan interacciones."
        emptyIcon={Target}
        pageSize={10}
      />
      <DataTable
        columns={acquisitionColumns}
        data={data.rows ?? []}
        searchPlaceholder="Buscar fuente, medio o campana..."
        emptyTitle="Sin fuentes registradas"
        emptyDescription="La atribucion aparecera cuando existan sesiones."
        emptyIcon={Route}
        pageSize={15}
      />
      <DataTable
        columns={landingColumns}
        data={data.landingPages ?? []}
        searchPlaceholder="Buscar pagina de entrada..."
        emptyTitle="Sin paginas de entrada"
        emptyDescription="No hay sesiones de entrada para este periodo."
        emptyIcon={Route}
        pageSize={15}
      />
    </div>
  );
}

function ContentReport({ data }) {
  return (
    <div className="space-y-6">
      <ReportCard title="Contenido mas visto">
        {data.rows?.length ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.rows.slice(0, 10)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="path" width={120} />
              <Tooltip />
              <Bar dataKey="pageviews" name="Vistas" fill={COLORS.secondary} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart />
        )}
      </ReportCard>
      <DataTable
        columns={pageColumns}
        data={data.rows ?? []}
        searchPlaceholder="Buscar ruta..."
        emptyTitle="Sin contenido medido"
        emptyDescription="Las vistas de pagina apareceran aqui."
        emptyIcon={Eye}
        pageSize={15}
      />
      <DataTable
        columns={ctaColumns}
        data={data.ctas ?? []}
        searchPlaceholder="Buscar CTA..."
        emptyTitle="Sin CTA medidos"
        emptyDescription="Usa data-runly-event en los elementos que quieras seguir (data-atlas-event tambien sigue funcionando)."
        emptyIcon={MousePointerClick}
        pageSize={15}
      />
    </div>
  );
}

function ConversionsReport({ data }) {
  return (
    <div className="space-y-6">
      <ReportCard
        title="Embudo de conversion"
        description="Secuencia fija desde la vista del formulario hasta la conversion."
      >
        {data.funnel?.length ? (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={data.funnel} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="label" width={150} />
              <Tooltip />
              <Bar dataKey="count" name="Personas" fill={COLORS.success} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart />
        )}
      </ReportCard>
      <DataTable
        columns={formColumns}
        data={data.rows ?? []}
        searchPlaceholder="Buscar formulario..."
        emptyTitle="Sin formularios medidos"
        emptyDescription="Las vistas, inicios y envios apareceran aqui."
        emptyIcon={UserRoundCheck}
        pageSize={15}
      />
      <DataTable
        columns={campaignColumns}
        data={data.campaigns ?? []}
        searchPlaceholder="Buscar campana o fuente..."
        emptyTitle="Sin conversiones por campana"
        emptyDescription="Las campanas con conversiones apareceran aqui."
        emptyIcon={Target}
        pageSize={15}
      />
    </div>
  );
}

function RetentionReport({ data }) {
  return (
    <div className="space-y-6">
      <ReportCard
        title="Visitantes nuevos y recurrentes"
        description="Visitantes reconocidos por primera vez frente a quienes regresaron."
      >
        {data.series?.length ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.series}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar
                dataKey="newVisitors"
                name="Nuevos"
                fill={COLORS.primary}
              />
              <Bar
                dataKey="returningVisitors"
                name="Recurrentes"
                fill={COLORS.secondary}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart />
        )}
      </ReportCard>
      <ReportCard
        title="Retencion por cohorte"
        description="Porcentaje de visitantes que vuelve despues de 1, 7 y 30 dias."
      >
        {data.cohortSeries?.length ? (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={data.cohortSeries}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" />
              <YAxis unit="%" />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="d1Rate"
                name="D1"
                stroke={COLORS.primary}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="d7Rate"
                name="D7"
                stroke={COLORS.secondary}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="d30Rate"
                name="D30"
                stroke={COLORS.warning}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart />
        )}
      </ReportCard>
      <DataTable
        columns={retentionColumns}
        data={data.rows ?? []}
        searchPlaceholder="Buscar cohorte..."
        emptyTitle="Sin cohortes suficientes"
        emptyDescription="D1, D7 y D30 se completan conforme regresan los visitantes."
        emptyIcon={UsersRound}
        pageSize={15}
      />
    </div>
  );
}

export function GrowthAnalyticsReport({ report, data }) {
  if (report === "acquisition") return <AcquisitionReport data={data} />;
  if (report === "content") return <ContentReport data={data} />;
  if (report === "conversions") return <ConversionsReport data={data} />;
  if (report === "retention") return <RetentionReport data={data} />;
  return <OverviewReport data={data} />;
}
