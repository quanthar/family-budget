"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Trash2,
  Calendar,
} from "lucide-react";

interface CategoryOption {
  id: string;
  name: string;
  color: string;
  icon: string;
}

interface MemberOption {
  id: string;
  name: string;
}

export interface EditableRecurringRule {
  ruleId?: string;
  id?: string;
  name: string;
  amount: number;
  type?: "income" | "expense";
  categoryId?: string;
  categoryName?: string;
  categoryColor?: string;
  owner?: string;
  dayOfMonth?: number;
  date?: string | Date;
}

interface EditRecurringModalProps {
  isOpen: boolean;
  onClose: () => void;
  rule: EditableRecurringRule | null;
  onSuccess: () => void;
  onDelete?: (id: string) => void;
}

export function EditRecurringModal({
  isOpen,
  onClose,
  rule,
  onSuccess,
  onDelete,
}: EditRecurringModalProps) {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [type, setType] = useState<"income" | "expense">("expense");
  const [categoryId, setCategoryId] = useState("");
  const [owner, setOwner] = useState("shared");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetch("/api/categories")
        .then((res) => res.json())
        .then((data) => {
          if (data.categories) setCategories(data.categories);
        })
        .catch(() => {});

      fetch("/api/members")
        .then((res) => res.json())
        .then((data) => {
          if (data.members) setMembers(data.members);
        })
        .catch(() => {});
    }
  }, [isOpen]);

  useEffect(() => {
    if (rule) {
      setName(rule.name || "");
      setAmount(String(rule.amount || ""));
      setType(rule.type || "expense");
      setCategoryId(rule.categoryId || "");
      setOwner(rule.owner || "shared");

      if (rule.dayOfMonth !== undefined) {
        setDayOfMonth(String(rule.dayOfMonth));
      } else if (rule.date) {
        try {
          const d = new Date(rule.date);
          setDayOfMonth(String(d.getDate()));
        } catch {
          setDayOfMonth("1");
        }
      } else {
        setDayOfMonth("1");
      }
    }
  }, [rule]);

  if (!rule) return null;

  const targetId = rule.id || rule.ruleId;

  const handleSave = async () => {
    const numAmount = parseFloat(amount);
    if (!name.trim()) {
      toast.error("Укажите название платежа");
      return;
    }
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error("Укажите корректную сумму");
      return;
    }
    if (!targetId) {
      toast.error("Идентификатор платежа не найден");
      return;
    }

    const day = parseInt(dayOfMonth, 10);
    const validDay = isNaN(day) ? 1 : Math.min(31, Math.max(1, day));

    setLoading(true);
    try {
      const res = await fetch("/api/recurring", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: targetId,
          name: name.trim(),
          amount: numAmount,
          dayOfMonth: validDay,
          type,
          categoryId: categoryId || (categories[0]?.id ?? undefined),
          owner,
          period: "monthly",
        }),
      });

      if (!res.ok) throw new Error("Update failed");

      toast.success("Регулярный платёж обновлен");
      window.dispatchEvent(new CustomEvent("budget:reload"));
      onSuccess();
      onClose();
    } catch {
      toast.error("Не удалось обновить платёж");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Удалить регулярный платёж "${name}" (${amount} ₽)?`)) {
      return;
    }

    if (!targetId) return;

    setDeleting(true);
    try {
      if (onDelete) {
        onDelete(targetId);
        onClose();
        return;
      }

      const res = await fetch(`/api/recurring?id=${targetId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");

      toast.success("Регулярный платёж удален");
      window.dispatchEvent(new CustomEvent("budget:reload"));
      onSuccess();
      onClose();
    } catch {
      toast.error("Не удалось удалить платёж");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Редактировать регулярный платёж"
      size="md"
      closeOnBackdropClick={false}
    >
      <div className="space-y-4">
        {/* Type switch */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setType("expense")}
            className={cn(
              "flex items-center justify-center gap-1.5 h-9 rounded-[var(--radius-lg)] text-xs font-medium border transition-colors",
              type === "expense"
                ? "bg-expense-muted text-expense-text border-expense/40"
                : "bg-bg-surface text-fg-secondary border-border-default hover:bg-bg-hover"
            )}
          >
            <ArrowDown size={14} />
            Расход (аренда, подписка, ЖКХ)
          </button>

          <button
            type="button"
            onClick={() => setType("income")}
            className={cn(
              "flex items-center justify-center gap-1.5 h-9 rounded-[var(--radius-lg)] text-xs font-medium border transition-colors",
              type === "income"
                ? "bg-income-muted text-income-text border-income/40"
                : "bg-bg-surface text-fg-secondary border-border-default hover:bg-bg-hover"
            )}
          >
            <ArrowUp size={14} />
            Доход (пособие, аренда)
          </button>
        </div>

        {/* Name */}
        <div>
          <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
            Название
          </label>
          <input
            type="text"
            placeholder="Например: Ипотека, Интернет, Фитнес"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full h-10 px-3 text-sm bg-bg-surface text-fg-primary border border-border-default rounded-[var(--radius-lg)] focus:outline-none focus:border-accent"
            autoFocus
          />
        </div>

        {/* Amount & Day of month */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
              Сумма в месяц
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
                className="w-full h-10 px-3 pr-8 text-sm bg-bg-surface text-fg-primary border border-border-default rounded-[var(--radius-lg)] font-medium tabular-nums focus:outline-none focus:border-accent"
              />
              <span className="absolute right-3 top-2.5 text-sm text-fg-muted">₽</span>
            </div>
          </div>

          <div>
            <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
              День списания (число)
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                maxLength={2}
                placeholder="1"
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value.replace(/[^\d]/g, ""))}
                className="w-full h-10 px-3 pr-8 text-sm bg-bg-surface text-fg-primary border border-border-default rounded-[var(--radius-lg)] font-medium tabular-nums focus:outline-none focus:border-accent"
              />
              <span className="absolute right-3 top-2.5 text-xs text-fg-muted">число</span>
            </div>
          </div>
        </div>

        {/* Category */}
        <div>
          <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
            Категория
          </label>
          <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1 rounded-[var(--radius-lg)] bg-bg-surface/50 border border-border-default">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryId(cat.id)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-md)] text-xs font-medium transition-colors",
                  categoryId === cat.id
                    ? "bg-accent-muted text-accent-text border border-accent/40"
                    : "bg-bg-surface text-fg-secondary hover:bg-bg-hover"
                )}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: cat.color }}
                />
                <span>{cat.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Owner */}
        <div>
          <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
            Кто оплачивает
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setOwner("shared")}
              className={cn(
                "px-3 py-1.5 rounded-[var(--radius-lg)] text-xs font-medium border transition-colors",
                owner === "shared"
                  ? "bg-accent-muted text-accent-text border-accent/40"
                  : "bg-bg-surface text-fg-secondary border-border-default hover:bg-bg-hover"
              )}
            >
              Общий платёж
            </button>

            {members.map((m, idx) => {
              const val = idx === 0 ? "person1" : idx === 1 ? "person2" : m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setOwner(val)}
                  className={cn(
                    "px-3 py-1.5 rounded-[var(--radius-lg)] text-xs font-medium border transition-colors",
                    owner === val
                      ? "bg-accent-muted text-accent-text border-accent/40"
                      : "bg-bg-surface text-fg-secondary border-border-default hover:bg-bg-hover"
                  )}
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Modal actions */}
        <div className="flex items-center gap-2 pt-2">
          <Button
            type="button"
            variant="danger"
            size="md"
            disabled={loading || deleting}
            onClick={handleDelete}
            title="Удалить платёж"
            className="px-3"
          >
            {deleting ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <Trash2 size={16} />
            )}
          </Button>

          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            disabled={loading || deleting}
            onClick={onClose}
          >
            Отмена
          </Button>

          <Button
            type="button"
            className="flex-1"
            disabled={!name.trim() || !amount || parseFloat(amount) <= 0 || loading || deleting}
            onClick={handleSave}
          >
            {loading ? (
              <Loader2 className="animate-spin mr-2" size={16} />
            ) : null}
            Сохранить
          </Button>
        </div>
      </div>
    </Modal>
  );
}
