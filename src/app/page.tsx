"use client";

import { useEffect, useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { KPICard } from "@/components/ui/kpi-card";
import { AmountDisplay } from "@/components/ui/amount-display";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SkeletonCard } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  CalendarClock,
  ArrowDown,
  ArrowUp,
  Sparkles,
  Info,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

interface DashboardData {
  household: {
    id: string;
    name: string;
    currency: string;
  };
  period: { year: number; month: number };
  summary: {
    totalIncome: number;
    totalExpenses: number;
    balance: number;
    mandatoryRemaining: number;
    freeBalance: number;
    incomeChange?: number;
    expenseChange?: number;
    byCategory: Array<{
      id: string;
      name: string;
      color: string;
      icon: string;
      amount: number;
      percentage: number;
    }>;
    members: Array<{
      id: string;
      name: string;
      income: number;
      expenses: number;
      balance: number;
    }>;
  };
  forecast: {
    currentBalance: number;
    expectedIncomeRemaining: number;
    expectedExpenseRemaining: number;
    projectedEndMonthBalance: number;
    timeline: Array<{
      date: string;
      dateLabel: string;
      amount: number;
      type: "income" | "expense";
      label: string;
      category?: string;
      isCompleted?: boolean;
    }>;
    progressPercent: number;
  };
  insights: Array<{
    id: string;
    text: string;
    type: "info" | "positive" | "warning";
  }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(() => {
    fetch("/api/dashboard")
      .then((res) => res.json())
      .then((json) => {
        if (!json.error) {
          setData(json);
        }
      })
      .catch((err) => console.error("Dashboard error:", err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadDashboard();

    const handleReload = () => {
      loadDashboard();
    };

    window.addEventListener("budget:reload", handleReload);
    return () => window.removeEventListener("budget:reload", handleReload);
  }, [loadDashboard]);

  if (loading || !data) {
    return (
      <AppLayout>
        <div className="max-w-6xl mx-auto space-y-5 animate-pulse">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <SkeletonCard className="h-40" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SkeletonCard className="h-64" />
            <SkeletonCard className="h-64" />
          </div>
        </div>
      </AppLayout>
    );
  }

  const { summary, forecast, insights } = data;
  const progressPct = Math.min(100, Math.max(0, forecast.progressPercent || 0));

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-5 animate-fade-in-up">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <KPICard
            label="Остаток"
            amount={summary.balance}
            icon={<Wallet size={16} />}
            variant="accent"
          />
          <KPICard
            label="Доходы"
            amount={summary.totalIncome}
            change={summary.incomeChange}
            icon={<TrendingUp size={16} />}
            variant="income"
          />
          <KPICard
            label="Расходы"
            amount={summary.totalExpenses}
            change={summary.expenseChange}
            icon={<TrendingDown size={16} />}
            variant="expense"
          />
          <KPICard
            label="Обязательные"
            amount={summary.mandatoryRemaining}
            changeLabel="впереди"
            icon={<CalendarClock size={16} />}
            variant="warning"
          />
        </div>

        {/* Forecast Bar */}
        <Card>
          <CardHeader
            title="Прогноз до конца месяца"
            subtitle="С учётом ожидаемых зарплат и обязательных списаний"
          />
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-fg-secondary">Текущий баланс</span>
              <span className="text-fg-secondary">Прогноз к концу месяца</span>
            </div>
            <div className="relative h-2.5 bg-bg-surface rounded-[var(--radius-full)] overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-accent to-accent-hover rounded-[var(--radius-full)] transition-all duration-700"
                style={{ width: `${progressPct}%` }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-md border-2 border-accent"
                style={{ left: `${progressPct}%`, marginLeft: "-7px" }}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <AmountDisplay amount={summary.balance} size="md" colorize={false} />
                <p className="text-xs text-fg-muted mt-0.5">
                  Свободно: {summary.freeBalance.toLocaleString("ru-RU")} ₽
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-fg-tertiary">Ожидаемый остаток</p>
                <AmountDisplay
                  amount={forecast.projectedEndMonthBalance}
                  size="lg"
                  colorize={false}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Cash Flow + Categories */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          {/* Cash Flow Timeline */}
          <Card>
            <CardHeader title="Cash Flow" subtitle="Ближайшие поступления и платежи" />
            <div className="space-y-1">
              {forecast.timeline.length === 0 ? (
                <p className="text-sm text-fg-muted text-center py-6">
                  Нет запланированных операций
                </p>
              ) : (
                forecast.timeline.slice(0, 5).map((event, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex items-center justify-between py-2 px-2 rounded-[var(--radius-md)] hover:bg-bg-hover/50 transition-colors",
                      event.isCompleted && "opacity-60"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "w-8 h-8 rounded-[var(--radius-md)] flex items-center justify-center shrink-0",
                          event.amount > 0 ? "bg-income-muted" : "bg-expense-muted"
                        )}
                      >
                        {event.amount > 0 ? (
                          <ArrowUp size={14} className="text-income-text" />
                        ) : (
                          <ArrowDown size={14} className="text-expense-text" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm text-fg-primary leading-tight font-medium">
                          {event.label}
                        </p>
                        <p className="text-xs text-fg-muted">{event.dateLabel}</p>
                      </div>
                    </div>
                    <AmountDisplay
                      amount={event.amount}
                      size="sm"
                      colorize
                      showSign
                    />
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Categories */}
          <Card>
            <CardHeader title="Расходы по категориям" subtitle="Топ направлений трат" />
            <div className="space-y-2.5">
              {summary.byCategory.length === 0 ? (
                <p className="text-sm text-fg-muted text-center py-6">
                  Расходов в этом месяце пока нет
                </p>
              ) : (
                summary.byCategory.slice(0, 5).map((cat) => (
                  <div key={cat.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-fg-secondary font-medium">{cat.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-fg-muted">{cat.percentage}%</span>
                        <AmountDisplay amount={cat.amount} size="xs" colorize={false} />
                      </div>
                    </div>
                    <div className="h-1.5 bg-bg-surface rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${cat.percentage}%`,
                          backgroundColor: cat.color || "#6366f1",
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Members Split + Smart Insights */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          {/* Members */}
          <Card>
            <CardHeader title="По участникам" subtitle="Вклад в семейный бюджет" />
            <div className="space-y-3">
              {summary.members.map((member) => (
                <div
                  key={member.id}
                  className="p-3.5 bg-bg-surface/50 border border-border-default/60 rounded-[var(--radius-lg)] space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-fg-primary">
                      {member.name}
                    </span>
                    <Badge variant={member.balance >= 0 ? "income" : "expense"}>
                      Сальдо: {member.balance > 0 ? "+" : ""}
                      {member.balance.toLocaleString("ru-RU")} ₽
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-fg-tertiary">Доходы: </span>
                      <span className="font-medium text-income-text">
                        +{member.income.toLocaleString("ru-RU")} ₽
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-fg-tertiary">Расходы: </span>
                      <span className="font-medium text-expense-text">
                        -{member.expenses.toLocaleString("ru-RU")} ₽
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Smart Insights */}
          <Card>
            <CardHeader
              title="Умные инсайты"
              subtitle="Анализ состояния бюджета"
              action={<Sparkles size={16} className="text-accent-text" />}
            />
            <div className="space-y-2">
              {insights.length === 0 ? (
                <p className="text-sm text-fg-muted text-center py-6">
                  Все показатели в норме
                </p>
              ) : (
                insights.map((insight) => (
                  <div
                    key={insight.id}
                    className={cn(
                      "p-3 rounded-[var(--radius-lg)] text-xs flex items-start gap-2.5 leading-relaxed",
                      insight.type === "positive" && "bg-income-muted/40 border border-income/20 text-fg-primary",
                      insight.type === "warning" && "bg-expense-muted/40 border border-expense/20 text-fg-primary",
                      insight.type === "info" && "bg-accent-muted/40 border border-accent/20 text-fg-primary"
                    )}
                  >
                    {insight.type === "positive" && (
                      <CheckCircle2 size={16} className="text-income-text shrink-0 mt-0.5" />
                    )}
                    {insight.type === "warning" && (
                      <AlertTriangle size={16} className="text-expense-text shrink-0 mt-0.5" />
                    )}
                    {insight.type === "info" && (
                      <Info size={16} className="text-accent-text shrink-0 mt-0.5" />
                    )}
                    <span>{insight.text}</span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
