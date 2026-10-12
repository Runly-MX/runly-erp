// apps/desktop/src/modules/runly.pfm/screens/OverviewScreen.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  PageHeader,
  StatCard,
  SectionCard,
  SelectField,
  LoadingState,
  ErrorState,
} from "@runly/ui";
import { Wallet, TrendingDown, TrendingUp, Scale, CreditCard } from "lucide-react";
import { usePfmSummary, useBudgets, useGoals } from "../hooks/use-pfm-queries";
import { CategoryDonut } from "../components/CategoryDonut";
import { SpendTrendBar } from "../components/SpendTrendBar";
import { UpcomingChargesCard } from "../components/UpcomingChargesCard";
import { BudgetBars } from "../components/BudgetBars";
import { GoalRings } from "../components/GoalRings";
import {
  formatMoney,
  currentMonthKey,
  shiftMonth,
  formatMonthLabel,
  percentDelta,
} from "../lib/format";

export default function OverviewScreen() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(currentMonthKey());
  const { data: summary, isLoading, isError, refetch } = usePfmSummary(month);
  const { data: budgets = [] } = useBudgets();
  const { data: goals = [] } = useGoals();

  const monthOptions = [0, -1, -2, -3, -4, -5].map((d) => {
    const key = shiftMonth(currentMonthKey(), d);
    return { value: key, label: formatMonthLabel(key) };
  });

  const delta = summary ? percentDelta(summary.monthExpense, summary.prevMonthExpense) : null;
  const net = summary ? summary.monthIncome - summary.monthExpense : 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <PageHeader
        title="Resumen"
        description="Tus finanzas del mes"
        actions={<SelectField options={monthOptions} value={month} onChange={setMonth} />}
      />

      {isLoading && <LoadingState />}
      {isError && <ErrorState title="No se pudo cargar el resumen" onRetry={refetch} />}

      {summary && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Disponible" value={formatMoney(summary.spendable)} icon={Wallet} />
            <StatCard
              label="Inversiones"
              value={formatMoney(summary.investments)}
              icon={TrendingUp}
            />
            <StatCard
              label="Deuda tarjetas"
              value={summary.creditDebt ? `-${formatMoney(summary.creditDebt)}` : formatMoney(0)}
              icon={CreditCard}
            />
            <StatCard
              label="Ingresos del mes"
              value={formatMoney(summary.monthIncome)}
              icon={TrendingUp}
            />
            <StatCard
              label="Gastos del mes"
              value={formatMoney(summary.monthExpense)}
              icon={TrendingDown}
              trend={delta == null ? undefined : -delta}
            />
            <StatCard
              label="Neto del mes"
              value={`${net < 0 ? "-" : "+"}${formatMoney(Math.abs(net))}`}
              icon={Scale}
            />
          </div>
          <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))] tabular-nums">
            Patrimonio neto: {formatMoney(summary.totalBalance)}
          </p>

          <div className="mt-6">
            <UpcomingChargesCard />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <SectionCard title="Gasto por categoria">
              <CategoryDonut
                data={summary.byCategory}
                currency="MXN"
                centerLabel="Gasto del mes"
                centerValue={summary.monthExpense}
              />
              <ul className="mt-3 space-y-1.5">
                {summary.byCategory.map((c) => (
                  <li
                    key={c.categoryId ?? c.name}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: c.color }}
                      />
                      <span className="truncate text-[hsl(var(--muted-foreground))]">{c.name}</span>
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">{formatMoney(c.total)}</span>
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard title="Tendencia (6 meses)">
              <SpendTrendBar data={summary.trend} currency="MXN" />
            </SectionCard>
          </div>

          {(budgets.length > 0 || goals.length > 0) && (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <SectionCard
                title="Presupuestos del mes"
                action={
                  <button
                    type="button"
                    className="text-xs font-medium text-[var(--brand-primary)] hover:underline"
                    onClick={() => navigate("/app/m/runly.pfm/budgets")}
                  >
                    Ver todos
                  </button>
                }
              >
                <BudgetBars budgets={budgets} />
              </SectionCard>
              <SectionCard
                title="Metas"
                action={
                  <button
                    type="button"
                    className="text-xs font-medium text-[var(--brand-primary)] hover:underline"
                    onClick={() => navigate("/app/m/runly.pfm/budgets")}
                  >
                    Ver todas
                  </button>
                }
              >
                <GoalRings
                  goals={goals}
                  onContribute={() => navigate("/app/m/runly.pfm/budgets")}
                />
              </SectionCard>
            </div>
          )}
        </>
      )}
    </div>
  );
}
