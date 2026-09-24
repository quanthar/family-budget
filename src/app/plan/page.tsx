"use client";

import { useEffect, useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AmountDisplay } from "@/components/ui/amount-display";
import { SkeletonCard } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Plus,
  ArrowUpRight,
  ShieldCheck,
  Wallet,
  Pencil,
  Trash2,
} from "lucide-react";
import { QuickAddModal } from "@/components/modals/quick-add-modal";
import { EditRecurringModal, type EditableRecurringRule } from "@/components/modals/edit-recurring-modal";

interface PlanData {
  summary: {
    totalIncome: number;
    totalExpenses: number;
    balance: number;
    mandatoryRemaining: number;
    freeBalance: number;
  };
  recurringInstances: Array<{
    ruleId: string;
    name: string;
    amount: number;
    type: "income" | "expense";
    date: string;
    categoryName?: string;
    categoryColor?: string;
    owner: string;
    isPaid: boolean;
    paidAmount?: number;
  }>;
}

export default function PlanPage() {
  const [data, setData] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<EditableRecurringRule | null>(null);

  const fetchPlan = useCallback(() => {
    fetch("/api/dashboard")
      .then((res) => res.json())
      .then((json) => {
        if (!json.error) setData(json);
      })
      .catch((err) => console.error("Error fetching plan:", err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchPlan();
    const handleReload = () => fetchPlan();
    window.addEventListener("budget:reload", handleReload);
    return () => window.removeEventListener("budget:reload", handleReload);
  }, [fetchPlan]);

  const handleDeleteRule = async (ruleId: string, name: string) => {
    if (!confirm(`Удалить регулярный платёж "${name}"?`)) return;
    try {
      const res = await fetch(`/api/recurring?id=${ruleId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Регулярный платёж удален");
      fetchPlan();
      window.dispatchEvent(new CustomEvent("budget:reload"));
    } catch {
      toast.error("Не удалось удалить платёж");
    }
  };

  const handleMarkAsPaid = async (rule: PlanData["recurringInstances"][0]) => {
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "expense",
          amount: rule.amount,
          recurringRuleId: rule.ruleId,
          description: rule.name,
          date: new Date().toISOString(),
        }),
      });

      if (!res.ok) throw new Error("Payment failed");

      toast.success(`Платёж "${rule.name}" отмечен как оплаченный`);
      fetchPlan();
      window.dispatchEvent(new CustomEvent("budget:reload"));
    } catch {
      toast.error("Не удалось отметить платёж");
    }
  };

  if (loading || !data) {
    return (
      <AppLayout>
        <div className="max-w-5xl mx-auto space-y-5">
          <SkeletonCard className="h-40" />
          <SkeletonCard className="h-64" />
        </div>
      </AppLayout>
    );
  }

  const { summary, recurringInstances } = data;
  const totalMandatory = recurringInstances.reduce((sum, r) => sum + r.amount, 0);
  const paidMandatory = recurringInstances
    .filter((r) => r.isPaid)
    .reduce((sum, r) => sum + r.amount, 0);
  const mandatoryProgress = totalMandatory > 0 ? Math.round((paidMandatory / totalMandatory) * 100) : 100;

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-5 animate-fade-in-up">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-fg-primary">
              План бюджета
            </h1>
            <p className="text-xs sm:text-sm text-fg-muted mt-0.5">
              Обязательные платежи, распределение доходов и свободный остаток
            </p>
          </div>
          <Button onClick={() => setIsAddOpen(true)} className="flex items-center gap-1.5">
            <Plus size={16} />
            Добавить платёж
          </Button>
        </div>

        {/* 3 Pillars of Budget */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
          <Card className="p-4 bg-income-muted/20 border-income/30">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-income-text mb-2">
              <ArrowUpRight size={16} />
              <span>Доходы месяца</span>
            </div>
            <AmountDisplay amount={summary.totalIncome} size="lg" colorize={false} />
            <p className="text-xs text-fg-muted mt-2">
              Фактические поступления зарплат и бонусов
            </p>
          </Card>

          <Card className="p-4 bg-expense-muted/20 border-expense/30">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-expense-text mb-2">
              <CalendarClock size={16} />
              <span>Обязательные расходы</span>
            </div>
            <AmountDisplay amount={totalMandatory} size="lg" colorize={false} />
            <p className="text-xs text-fg-muted mt-2">
              Ипотека, ЖКХ, аренда, кредиты, подписки
            </p>
          </Card>

          <Card className="p-4 bg-accent-muted/20 border-accent/30">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent-text mb-2">
              <Wallet size={16} />
              <span>Свободный остаток</span>
            </div>
            <AmountDisplay
              amount={summary.freeBalance}
              size="lg"
              colorize={false}
            />
            <p className="text-xs text-fg-muted mt-2">
              Деньги на жизнь, накопления и развлечения
            </p>
          </Card>
        </div>

        {/* Progress of mandatory payments */}
        <Card className="space-y-3">
          <CardHeader
            title="Прогресс оплаты обязательств"
            subtitle={`Оплачено ${paidMandatory.toLocaleString("ru-RU")} ₽ из ${totalMandatory.toLocaleString("ru-RU")} ₽`}
          />
          <div className="space-y-1.5">
            <div className="h-3 bg-bg-surface rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-accent to-accent-hover rounded-full transition-all duration-700"
                style={{ width: `${mandatoryProgress}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-fg-muted">
              <span>{mandatoryProgress}% оплачено</span>
              <span>Осталось оплатить: {summary.mandatoryRemaining.toLocaleString("ru-RU")} ₽</span>
            </div>
          </div>
        </Card>

        {/* Mandatory payments checklist */}
        <Card className="space-y-3">
          <CardHeader
            title="Регулярные обязательные платежи"
            subtitle="График списаний в текущем месяце"
            action={<ShieldCheck size={18} className="text-accent-text" />}
          />

          <div className="divide-y divide-border-default/40">
            {recurringInstances.map((rule) => {
              const ruleDate = new Date(rule.date);
              const dayStr = ruleDate.getDate();

              return (
                <div
                  key={rule.ruleId}
                  className="flex items-center justify-between py-3 px-1 hover:bg-bg-hover/30 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-8 h-8 rounded-[var(--radius-md)] flex items-center justify-center shrink-0",
                        rule.isPaid ? "bg-income-muted text-income-text" : "bg-bg-surface text-fg-muted border border-border-default"
                      )}
                    >
                      {rule.isPaid ? <CheckCircle2 size={16} /> : <Clock size={16} />}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-fg-primary">
                          {rule.name}
                        </span>
                        <Badge variant={rule.isPaid ? "income" : "warning"}>
                          {rule.isPaid ? "Оплачено" : `${dayStr}-го числа`}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-fg-muted mt-0.5">
                        <span style={{ color: rule.categoryColor }}>
                          {rule.categoryName}
                        </span>
                        <span>•</span>
                        <span>
                          {rule.owner === "shared" ? "Общий" : rule.owner === "person1" ? "Алексей" : "Мария"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <AmountDisplay
                      amount={rule.amount}
                      size="sm"
                      colorize={false}
                    />

                    {!rule.isPaid && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleMarkAsPaid(rule)}
                        className="text-xs h-8 px-2.5"
                      >
                        Оплатить
                      </Button>
                    )}

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => setEditingRule(rule)}
                        title="Редактировать платёж"
                        className="p-1.5 text-fg-muted hover:text-accent-text hover:bg-accent-muted rounded-[var(--radius-md)] transition-colors"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRule(rule.ruleId, rule.name)}
                        title="Удалить платёж"
                        className="p-1.5 text-fg-muted hover:text-expense-text hover:bg-expense-muted rounded-[var(--radius-md)] transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <QuickAddModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSuccess={fetchPlan}
      />

      <EditRecurringModal
        isOpen={Boolean(editingRule)}
        onClose={() => setEditingRule(null)}
        rule={editingRule}
        onSuccess={fetchPlan}
        onDelete={(id) => handleDeleteRule(id, editingRule?.name || "")}
      />
    </AppLayout>
  );
}
