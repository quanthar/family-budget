"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AmountDisplay } from "@/components/ui/amount-display";
import { EmptyState, SkeletonCard } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  ArrowDown,
  ArrowUp,
  ArrowLeftRight,
  Search,
  Trash2,
  Filter,
  Plus,
  Calendar,
  Pencil,
} from "lucide-react";
import { QuickAddModal } from "@/components/modals/quick-add-modal";
import { EditTransactionModal, type EditableTransaction } from "@/components/modals/edit-transaction-modal";

interface Transaction {
  id: string;
  type: "income" | "expense" | "transfer";
  amount: number;
  date: string;
  description: string;
  category?: {
    id: string;
    name: string;
    color: string;
    icon: string;
  } | null;
  member?: {
    id: string;
    name: string;
  } | null;
  targetMember?: {
    id: string;
    name: string;
  } | null;
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<EditableTransaction | null>(null);

  const fetchTransactions = useCallback(() => {
    fetch("/api/transactions")
      .then((res) => res.json())
      .then((data) => {
        if (data.transactions) {
          setTransactions(data.transactions);
        }
      })
      .catch((err) => console.error("Error fetching transactions:", err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchTransactions();
    const handleReload = () => fetchTransactions();
    window.addEventListener("budget:reload", handleReload);
    return () => window.removeEventListener("budget:reload", handleReload);
  }, [fetchTransactions]);

  const handleDelete = async (id: string, description: string, amount: number) => {
    if (!confirm(`Удалить операцию "${description || "Без описания"}" (${amount} ₽)?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/transactions?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");

      setTransactions((prev) => prev.filter((t) => t.id !== id));
      toast.success("Операция удалена");
      window.dispatchEvent(new CustomEvent("budget:reload"));
    } catch {
      toast.error("Не удалось удалить операцию");
    }
  };

  // Filtered transactions
  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      if (typeFilter !== "all" && tx.type !== typeFilter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const descMatch = tx.description?.toLowerCase().includes(query);
        const catMatch = tx.category?.name.toLowerCase().includes(query);
        const memberMatch = tx.member?.name.toLowerCase().includes(query);
        if (!descMatch && !catMatch && !memberMatch) return false;
      }
      return true;
    });
  }, [transactions, typeFilter, searchQuery]);

  // Group by date
  const groupedByDate = useMemo(() => {
    const groups: Record<string, Transaction[]> = {};
    for (const tx of filtered) {
      const dateKey = tx.date.slice(0, 10);
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(tx);
    }
    return groups;
  }, [filtered]);

  // Total summary of filtered
  const filteredTotals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const tx of filtered) {
      if (tx.type === "income") income += tx.amount;
      if (tx.type === "expense") expense += tx.amount;
    }
    return { income, expense, balance: income - expense };
  }, [filtered]);

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-5 animate-fade-in-up">
        {/* Header actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-fg-primary">
              История операций
            </h1>
            <p className="text-xs sm:text-sm text-fg-muted mt-0.5">
              Все доходы, расходы и переводы
            </p>
          </div>
          <Button onClick={() => setIsAddOpen(true)} className="flex items-center gap-1.5">
            <Plus size={16} />
            Записать операцию
          </Button>
        </div>

        {/* Filter bar & Search */}
        <Card className="space-y-3">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted"
              />
              <input
                type="text"
                placeholder="Поиск по описанию, категории или участнику..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-9 pr-3 text-sm bg-bg-surface text-fg-primary placeholder:text-fg-muted border border-border-default rounded-[var(--radius-lg)] outline-none focus:border-accent"
              />
            </div>

            {/* Type buttons */}
            <div className="flex gap-1.5 bg-bg-surface p-1 rounded-[var(--radius-lg)] border border-border-default/50 overflow-x-auto">
              {[
                { key: "all", label: "Все" },
                { key: "expense", label: "Расходы" },
                { key: "income", label: "Доходы" },
                { key: "transfer", label: "Переводы" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setTypeFilter(tab.key)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] whitespace-nowrap transition-colors",
                    typeFilter === tab.key
                      ? "bg-bg-elevated text-fg-primary shadow-sm"
                      : "text-fg-secondary hover:text-fg-primary"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quick stats for current filter */}
          <div className="flex items-center gap-4 text-xs pt-2 border-t border-border-default/40">
            <span className="text-fg-muted">Найдено: {filtered.length}</span>
            <span className="text-income-text font-medium">
              Доходы: +{filteredTotals.income.toLocaleString("ru-RU")} ₽
            </span>
            <span className="text-expense-text font-medium">
              Расходы: -{filteredTotals.expense.toLocaleString("ru-RU")} ₽
            </span>
          </div>
        </Card>

        {/* Transactions list */}
        {loading ? (
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Операций не найдено"
            description="Попробуйте изменить параметры поиска или добавить новую операцию."
            action={
              <Button onClick={() => setIsAddOpen(true)} className="mt-2">
                Добавить первую операцию
              </Button>
            }
          />
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedByDate).map(([dateStr, items]) => {
              const dateObj = new Date(dateStr);
              const formattedDate = dateObj.toLocaleDateString("ru-RU", {
                weekday: "long",
                day: "numeric",
                month: "long",
              });

              return (
                <div key={dateStr} className="space-y-1.5">
                  <div className="flex items-center gap-2 px-1 text-xs font-medium text-fg-muted uppercase tracking-wider">
                    <Calendar size={13} />
                    <span>{formattedDate}</span>
                  </div>

                  <Card className="divide-y divide-border-default/40 p-0 overflow-hidden">
                    {items.map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between p-3.5 hover:bg-bg-hover/40 transition-colors group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={cn(
                              "w-9 h-9 rounded-[var(--radius-lg)] flex items-center justify-center shrink-0",
                              tx.type === "income" && "bg-income-muted text-income-text",
                              tx.type === "expense" && "bg-expense-muted text-expense-text",
                              tx.type === "transfer" && "bg-transfer-muted text-transfer"
                            )}
                          >
                            {tx.type === "income" && <ArrowUp size={16} />}
                            {tx.type === "expense" && <ArrowDown size={16} />}
                            {tx.type === "transfer" && <ArrowLeftRight size={16} />}
                          </div>

                          <div className="min-w-0">
                            <p className="text-sm font-medium text-fg-primary truncate">
                              {tx.description ||
                                (tx.type === "transfer"
                                  ? `Перевод ${tx.member?.name || ""} → ${tx.targetMember?.name || ""}`
                                  : tx.category?.name || "Без названия")}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-fg-muted mt-0.5">
                              {tx.category && (
                                <span
                                  className="inline-flex items-center gap-1 font-medium"
                                  style={{ color: tx.category.color }}
                                >
                                  {tx.category.name}
                                </span>
                              )}
                              {tx.member && (
                                <>
                                  <span>•</span>
                                  <span>{tx.member.name}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <AmountDisplay
                            amount={tx.type === "expense" ? -tx.amount : tx.amount}
                            size="md"
                            colorize
                            showSign
                          />

                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => setEditingTx(tx)}
                              title="Редактировать операцию"
                              className="p-1.5 text-fg-muted hover:text-accent-text hover:bg-accent-muted rounded-[var(--radius-md)] transition-colors"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(tx.id, tx.description, tx.amount)}
                              title="Удалить операцию"
                              className="p-1.5 text-fg-muted hover:text-expense-text hover:bg-expense-muted rounded-[var(--radius-md)] transition-colors"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </Card>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <QuickAddModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSuccess={fetchTransactions}
      />

      <EditTransactionModal
        isOpen={Boolean(editingTx)}
        onClose={() => setEditingTx(null)}
        transaction={editingTx}
        onSuccess={fetchTransactions}
      />
    </AppLayout>
  );
}
