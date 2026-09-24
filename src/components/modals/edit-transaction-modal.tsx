"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  ArrowDown,
  ArrowUp,
  ArrowLeftRight,
  Loader2,
  Trash2,
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

export interface EditableTransaction {
  id: string;
  type: "income" | "expense" | "transfer";
  amount: number;
  date: string;
  description: string;
  category?: {
    id: string;
    name: string;
    color: string;
    icon?: string;
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

interface EditTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: EditableTransaction | null;
  onSuccess: () => void;
  onDelete?: (id: string) => void;
}

export function EditTransactionModal({
  isOpen,
  onClose,
  transaction,
  onSuccess,
  onDelete,
}: EditTransactionModalProps) {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [type, setType] = useState<"income" | "expense" | "transfer">("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [targetMemberId, setTargetMemberId] = useState("");
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
    if (transaction) {
      setType(transaction.type);
      setAmount(String(transaction.amount || ""));
      setDescription(transaction.description || "");
      try {
        const d = new Date(transaction.date);
        setDate(d.toISOString().split("T")[0]);
      } catch {
        setDate(new Date().toISOString().split("T")[0]);
      }
      setCategoryId(transaction.category?.id || "");
      setMemberId(transaction.member?.id || "");
      setTargetMemberId(transaction.targetMember?.id || "");
    }
  }, [transaction]);

  if (!transaction) return null;

  const handleSave = async () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error("Укажите корректную сумму");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: transaction.id,
          type,
          amount: numAmount,
          description: description.trim(),
          date: new Date(date).toISOString(),
          categoryId: type === "transfer" ? null : categoryId || null,
          memberId: memberId || null,
          targetMemberId: type === "transfer" ? targetMemberId || null : null,
        }),
      });

      if (!res.ok) throw new Error("Update failed");

      toast.success("Операция обновлена");
      window.dispatchEvent(new CustomEvent("budget:reload"));
      onSuccess();
      onClose();
    } catch {
      toast.error("Не удалось обновить операцию");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Удалить операцию "${description || "Без описания"}" (${amount} ₽)?`)) {
      return;
    }

    setDeleting(true);
    try {
      if (onDelete) {
        onDelete(transaction.id);
        onClose();
        return;
      }

      const res = await fetch(`/api/transactions?id=${transaction.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");

      toast.success("Операция удалена");
      window.dispatchEvent(new CustomEvent("budget:reload"));
      onSuccess();
      onClose();
    } catch {
      toast.error("Не удалось удалить операцию");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Редактировать операцию"
      size="md"
      closeOnBackdropClick={false}
    >
      <div className="space-y-4">
        {/* Type switch */}
        <div className="grid grid-cols-3 gap-2">
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
            Расход
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
            Доход
          </button>

          <button
            type="button"
            onClick={() => setType("transfer")}
            className={cn(
              "flex items-center justify-center gap-1.5 h-9 rounded-[var(--radius-lg)] text-xs font-medium border transition-colors",
              type === "transfer"
                ? "bg-transfer-muted text-transfer border-transfer/40"
                : "bg-bg-surface text-fg-secondary border-border-default hover:bg-bg-hover"
            )}
          >
            <ArrowLeftRight size={14} />
            Перевод
          </button>
        </div>

        {/* Amount */}
        <div>
          <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
            Сумма
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
              className="w-full h-11 px-3 pr-8 text-base bg-bg-surface text-fg-primary border border-border-default rounded-[var(--radius-lg)] font-medium tabular-nums focus:outline-none focus:border-accent"
              autoFocus
            />
            <span className="absolute right-3 top-3 text-sm text-fg-muted">₽</span>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
            Описание
          </label>
          <input
            type="text"
            placeholder="Например: Продукты, кофе, бензин..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full h-10 px-3 text-sm bg-bg-surface text-fg-primary border border-border-default rounded-[var(--radius-lg)] focus:outline-none focus:border-accent"
          />
        </div>

        {/* Date */}
        <div>
          <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
            Дата операции
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full h-10 px-3 text-sm bg-bg-surface text-fg-primary border border-border-default rounded-[var(--radius-lg)] focus:outline-none focus:border-accent"
          />
        </div>

        {/* Category (for expense and income) */}
        {type !== "transfer" && (
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
        )}

        {/* Members */}
        {type === "transfer" ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
                От кого
              </label>
              <select
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-bg-surface text-fg-primary border border-border-default rounded-[var(--radius-lg)] focus:outline-none focus:border-accent"
              >
                <option value="">Выберите...</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
                Кому
              </label>
              <select
                value={targetMemberId}
                onChange={(e) => setTargetMemberId(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-bg-surface text-fg-primary border border-border-default rounded-[var(--radius-lg)] focus:outline-none focus:border-accent"
              >
                <option value="">Выберите...</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div>
            <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
              Кто {type === "income" ? "получил" : "оплатил"}
            </label>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMemberId(m.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-[var(--radius-lg)] text-xs font-medium border transition-colors",
                    memberId === m.id
                      ? "bg-accent-muted text-accent-text border-accent/40"
                      : "bg-bg-surface text-fg-secondary border-border-default hover:bg-bg-hover"
                  )}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Modal actions */}
        <div className="flex items-center gap-2 pt-2">
          <Button
            type="button"
            variant="danger"
            size="md"
            disabled={loading || deleting}
            onClick={handleDelete}
            title="Удалить операцию"
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
            disabled={!amount || parseFloat(amount) <= 0 || loading || deleting}
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
