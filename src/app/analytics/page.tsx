"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardHeader } from "@/components/ui/card";
import { AmountDisplay } from "@/components/ui/amount-display";
import { SkeletonCard } from "@/components/ui/empty-state";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { TrendingUp, PieChart as PieIcon, BarChart3, Wallet } from "lucide-react";

interface AnalyticsData {
  history: Array<{
    month: string;
    year: number;
    income: number;
    expenses: number;
    savings: number;
  }>;
  categories: Array<{
    name: string;
    color: string;
    amount: number;
    percentage: number;
  }>;
  totalExpenseRecent: number;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics")
      .then((res) => res.json())
      .then((json) => {
        if (!json.error) setData(json);
      })
      .catch((err) => console.error("Error loading analytics:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <AppLayout>
        <div className="max-w-6xl mx-auto space-y-5">
          <SkeletonCard className="h-64" />
          <SkeletonCard className="h-64" />
        </div>
      </AppLayout>
    );
  }

  // Calculate totals
  const totalIncome6M = data.history.reduce((sum, m) => sum + m.income, 0);
  const totalExpense6M = data.history.reduce((sum, m) => sum + m.expenses, 0);
  const totalSavings6M = totalIncome6M - totalExpense6M;
  const savingsRate = totalIncome6M > 0 ? Math.round((totalSavings6M / totalIncome6M) * 100) : 0;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-5 animate-fade-in-up">
        {/* Header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-fg-primary">
            Аналитика и статистика
          </h1>
          <p className="text-xs sm:text-sm text-fg-muted mt-0.5">
            Динамика за последние 6 месяцев и распределение трат
          </p>
        </div>

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-income-text mb-1">
              <TrendingUp size={15} />
              <span>Доходы (6 мес.)</span>
            </div>
            <AmountDisplay amount={totalIncome6M} size="lg" colorize={false} />
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-expense-text mb-1">
              <BarChart3 size={15} />
              <span>Расходы (6 мес.)</span>
            </div>
            <AmountDisplay amount={totalExpense6M} size="lg" colorize={false} />
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-accent-text mb-1">
              <Wallet size={15} />
              <span>Норма сбережений</span>
            </div>
            <div className="text-2xl font-bold text-fg-primary mt-1">
              {savingsRate}%
            </div>
            <p className="text-xs text-fg-muted mt-1">
              Накоплено {totalSavings6M.toLocaleString("ru-RU")} ₽
            </p>
          </Card>
        </div>

        {/* Dynamics Bar Chart */}
        <Card className="p-4 sm:p-5 space-y-4">
          <CardHeader
            title="Динамика доходов и расходов"
            subtitle="Сравнение помесячно (руб.)"
          />

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="month"
                  stroke="#71717a"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#71717a"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `${Math.round(val / 1000)}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    borderColor: "#27272a",
                    borderRadius: "8px",
                    color: "#f4f4f5",
                    fontSize: "12px",
                  }}
                  formatter={(val: any) => [`${Number(val).toLocaleString("ru-RU")} ₽`]}
                />
                <Bar dataKey="income" name="Доходы" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="Расходы" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Categories Pie Chart & Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card className="p-4 sm:p-5 space-y-4">
            <CardHeader
              title="Структура расходов"
              subtitle="Доли категорий за последние 3 месяца"
              action={<PieIcon size={16} className="text-fg-muted" />}
            />

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.categories}
                    dataKey="amount"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={50}
                    paddingAngle={3}
                  >
                    {data.categories.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color || "#6366f1"} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#18181b",
                      borderColor: "#27272a",
                      borderRadius: "8px",
                      color: "#f4f4f5",
                      fontSize: "12px",
                    }}
                    formatter={(val: any) => [`${Number(val).toLocaleString("ru-RU")} ₽`]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-4 sm:p-5 space-y-3">
            <CardHeader
              title="Категории по суммам"
              subtitle="Рейтинг расходов"
            />

            <div className="space-y-3 overflow-y-auto max-h-64 pr-1">
              {data.categories.map((cat, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-fg-primary flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      {cat.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-fg-muted">{cat.percentage}%</span>
                      <span className="font-medium text-fg-primary">
                        {cat.amount.toLocaleString("ru-RU")} ₽
                      </span>
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
              ))}
            </div>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
