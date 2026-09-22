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
  Repeat,
  Loader2,
} from "lucide-react";

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type QuickAddStep = "choose" | "expense" | "income" | "transfer" | "recurring";

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

const addOptions = [
  {
    key: "expense" as const,
    label: "Расход",
    description: "Записать трату",
    icon: ArrowDown,
    color: "text-expense-text",
    bg: "bg-expense-muted",
  },
  {
    key: "income" as const,
    label: "Доход",
    description: "Записать поступление",
    icon: ArrowUp,
    color: "text-income-text",
    bg: "bg-income-muted",
  },
  {
    key: "transfer" as const,
    label: "Перевод",
    description: "Между участниками",
    icon: ArrowLeftRight,
    color: "text-transfer",
    bg: "bg-transfer-muted",
  },
  {
    key: "recurring" as const,
    label: "Регулярный платёж",
    description: "Создать повторяющийся",
    icon: Repeat,
    color: "text-accent-text",
    bg: "bg-accent-muted",
  },
];

export function QuickAddModal({ isOpen, onClose, onSuccess }: QuickAddModalProps) {
  const [step, setStep] = useState<QuickAddStep>("choose");
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);

  useEffect(() => {
    if (isOpen) {
      // Fetch categories and members
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

  const handleClose = () => {
    setStep("choose");
    onClose();
  };

  const handleCreated = () => {
    handleClose();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("budget:reload"));
    }
    if (onSuccess) onSuccess();
  };

  if (step === "choose") {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} title="Что добавить?" size="sm">
        <div className="space-y-1.5">
          {addOptions.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.key}
                onClick={() => setStep(option.key)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-[var(--radius-lg)]",
                  "text-left transition-colors duration-[var(--transition-fast)]",
                  "hover:bg-bg-hover active:bg-bg-active"
                )}
              >
                <div
                  className={cn(
                    "w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center",
                    option.bg
                  )}
                >
                  <Icon size={18} className={option.color} />
                </div>
                <div>
                  <p className="text-sm font-medium text-fg-primary">
                    {option.label}
                  </p>
                  <p className="text-xs text-fg-tertiary">
                    {option.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </Modal>
    );
  }

  if (step === "expense") {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} title="Новый расход" size="md">
        <QuickExpenseForm
          categories={categories}
          members={members}
          onSuccess={handleCreated}
        />
      </Modal>
    );
  }

  if (step === "income") {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} title="Новый доход" size="md">
        <QuickIncomeForm
          members={members}
          onSuccess={handleCreated}
        />
      </Modal>
    );
  }

  if (step === "transfer") {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} title="Перевод" size="md">
        <QuickTransferForm
          members={members}
          onSuccess={handleCreated}
        />
      </Modal>
    );
  }

  if (step === "recurring") {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} title="Регулярный платёж" size="md">
        <QuickRecurringForm
          categories={categories}
          members={members}
          onSuccess={handleCreated}
        />
      </Modal>
    );
  }

  return null;
}

// --- Quick Expense Form ---
function QuickExpenseForm({
  categories,
  members,
  onSuccess,
}: {
  categories: CategoryOption[];
  members: MemberOption[];
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id || "");
  const [memberId, setMemberId] = useState(members[0]?.id || "");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!categoryId && categories.length > 0) setCategoryId(categories[0].id);
    if (!memberId && members.length > 0) setMemberId(members[0].id);
  }, [categories, members, categoryId, memberId]);

  const handleSubmit = async () => {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) return;

    setLoading(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "expense",
          amount: num,
          categoryId: categoryId || undefined,
          memberId: memberId || undefined,
          date,
          description,
        }),
      });

      if (!res.ok) throw new Error("Failed to save");

      toast.success("Расход записан", {
        description: `${num.toLocaleString("ru-RU")} ₽ ${description ? `— ${description}` : ""}`,
      });
      onSuccess();
    } catch {
      toast.error("Не удалось сохранить расход");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-center py-2">
        <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1">
          Сколько?
        </label>
        <div className="flex items-center justify-center gap-1">
          <input
            type="text"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="0"
            className="text-4xl font-bold text-center bg-transparent text-fg-primary placeholder:text-fg-muted outline-none border-none w-48 tabular-nums"
            autoFocus
          />
          <span className="text-2xl text-fg-muted font-medium">₽</span>
        </div>
      </div>

      <div>
        <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
          Категория
        </label>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="w-full h-10 px-3 text-sm bg-bg-surface text-fg-primary border border-border-default rounded-[var(--radius-lg)]"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {members.length > 0 && (
        <div>
          <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
            Кто потратил
          </label>
          <div className="flex gap-2">
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMemberId(m.id)}
                className={cn(
                  "flex-1 h-10 px-3 text-sm font-medium rounded-[var(--radius-lg)] transition-all",
                  memberId === m.id
                    ? "bg-accent-muted text-accent-text border border-accent/40 shadow-sm"
                    : "bg-bg-surface text-fg-secondary border border-border-default hover:bg-bg-hover"
                )}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
          Дата
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full h-10 px-3 text-sm bg-bg-surface text-fg-primary border border-border-default rounded-[var(--radius-lg)]"
        />
      </div>

      <div>
        <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
          Комментарий
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Например: Супермаркет"
          className="w-full h-10 px-3 text-sm bg-bg-surface text-fg-primary placeholder:text-fg-muted border border-border-default rounded-[var(--radius-lg)]"
        />
      </div>

      <Button
        fullWidth
        size="lg"
        disabled={!amount || amount === "0" || loading}
        onClick={handleSubmit}
      >
        {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
        Сохранить расход
      </Button>
    </div>
  );
}

// --- Quick Income Form ---
function QuickIncomeForm({
  members,
  onSuccess,
}: {
  members: MemberOption[];
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [memberId, setMemberId] = useState(members[0]?.id || "");
  const [incomeType, setIncomeType] = useState("salary");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!memberId && members.length > 0) setMemberId(members[0].id);
  }, [members, memberId]);

  const handleSubmit = async () => {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) return;

    setLoading(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "income",
          amount: num,
          memberId: memberId || undefined,
          incomeType,
          date,
          description: description || (incomeType === "salary" ? "Зарплата" : "Доход"),
        }),
      });

      if (!res.ok) throw new Error("Failed to save");

      toast.success("Доход сохранён", {
        description: `+${num.toLocaleString("ru-RU")} ₽`,
      });
      onSuccess();
    } catch {
      toast.error("Не удалось сохранить доход");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-center py-2">
        <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1">
          Сколько?
        </label>
        <div className="flex items-center justify-center gap-1">
          <input
            type="text"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="0"
            className="text-4xl font-bold text-center bg-transparent text-income-text placeholder:text-fg-muted outline-none border-none w-48 tabular-nums"
            autoFocus
          />
          <span className="text-2xl text-fg-muted font-medium">₽</span>
        </div>
      </div>

      <div>
        <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
          Тип дохода
        </label>
        <select
          value={incomeType}
          onChange={(e) => setIncomeType(e.target.value)}
          className="w-full h-10 px-3 text-sm bg-bg-surface text-fg-primary border border-border-default rounded-[var(--radius-lg)]"
        >
          <option value="salary">Зарплата / Аванс</option>
          <option value="bonus">Премия / Бонус</option>
          <option value="freelance">Подработка / Проект</option>
          <option value="gift">Подарок</option>
          <option value="refund">Возврат средств</option>
          <option value="other">Другое</option>
        </select>
      </div>

      {members.length > 0 && (
        <div>
          <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
            Получатель
          </label>
          <div className="flex gap-2">
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMemberId(m.id)}
                className={cn(
                  "flex-1 h-10 px-3 text-sm font-medium rounded-[var(--radius-lg)] transition-all",
                  memberId === m.id
                    ? "bg-income-muted text-income-text border border-income/40 shadow-sm"
                    : "bg-bg-surface text-fg-secondary border border-border-default hover:bg-bg-hover"
                )}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
          Дата
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full h-10 px-3 text-sm bg-bg-surface text-fg-primary border border-border-default rounded-[var(--radius-lg)]"
        />
      </div>

      <div>
        <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
          Комментарий
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Например: Основная часть зарплаты"
          className="w-full h-10 px-3 text-sm bg-bg-surface text-fg-primary placeholder:text-fg-muted border border-border-default rounded-[var(--radius-lg)]"
        />
      </div>

      <Button
        fullWidth
        size="lg"
        variant="income"
        disabled={!amount || amount === "0" || loading}
        onClick={handleSubmit}
      >
        {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
        Сохранить доход
      </Button>
    </div>
  );
}

// --- Quick Transfer Form ---
function QuickTransferForm({
  members,
  onSuccess,
}: {
  members: MemberOption[];
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [fromMemberId, setFromMemberId] = useState(members[0]?.id || "");
  const [toMemberId, setToMemberId] = useState(members[1]?.id || members[0]?.id || "");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (members.length >= 2) {
      if (!fromMemberId) setFromMemberId(members[0].id);
      if (!toMemberId) setToMemberId(members[1].id);
    }
  }, [members, fromMemberId, toMemberId]);

  const handleSubmit = async () => {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) return;

    setLoading(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "transfer",
          amount: num,
          memberId: fromMemberId || undefined,
          targetMemberId: toMemberId || undefined,
          date,
          description: description || "Перевод между счетами",
        }),
      });

      if (!res.ok) throw new Error("Failed to save");

      toast.success("Перевод зафиксирован", {
        description: `${num.toLocaleString("ru-RU")} ₽`,
      });
      onSuccess();
    } catch {
      toast.error("Не удалось зафиксировать перевод");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-center py-2">
        <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1">
          Сумма перевода
        </label>
        <div className="flex items-center justify-center gap-1">
          <input
            type="text"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="0"
            className="text-4xl font-bold text-center bg-transparent text-transfer placeholder:text-fg-muted outline-none border-none w-48 tabular-nums"
            autoFocus
          />
          <span className="text-2xl text-fg-muted font-medium">₽</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
            От кого
          </label>
          <select
            value={fromMemberId}
            onChange={(e) => setFromMemberId(e.target.value)}
            className="w-full h-10 px-3 text-sm bg-bg-surface text-fg-primary border border-border-default rounded-[var(--radius-lg)]"
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <ArrowLeftRight size={18} className="text-fg-muted mt-5" />
        <div className="flex-1">
          <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
            Кому
          </label>
          <select
            value={toMemberId}
            onChange={(e) => setToMemberId(e.target.value)}
            className="w-full h-10 px-3 text-sm bg-bg-surface text-fg-primary border border-border-default rounded-[var(--radius-lg)]"
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
          Дата
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full h-10 px-3 text-sm bg-bg-surface text-fg-primary border border-border-default rounded-[var(--radius-lg)]"
        />
      </div>

      <Button
        fullWidth
        size="lg"
        disabled={!amount || amount === "0" || loading}
        onClick={handleSubmit}
      >
        {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
        Перевести
      </Button>
    </div>
  );
}

// --- Quick Recurring Form ---
function QuickRecurringForm({
  categories,
  onSuccess,
}: {
  categories: CategoryOption[];
  members: MemberOption[];
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id || "");
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [owner, setOwner] = useState<"shared" | "person1" | "person2">("shared");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!categoryId && categories.length > 0) setCategoryId(categories[0].id);
  }, [categories, categoryId]);

  const handleSubmit = async () => {
    const num = parseFloat(amount);
    if (!name.trim() || isNaN(num) || num <= 0 || !categoryId) return;

    setLoading(true);
    try {
      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          amount: num,
          categoryId,
          dayOfMonth,
          owner,
          type: "expense",
          period: "monthly",
        }),
      });

      if (!res.ok) throw new Error("Failed to save");

      toast.success("Регулярный платёж создан", {
        description: `${name} — ${num.toLocaleString("ru-RU")} ₽ (${dayOfMonth}-е число)`,
      });
      onSuccess();
    } catch {
      toast.error("Не удалось создать платёж");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
          Название
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Например: Ипотека или Интернет"
          className="w-full h-10 px-3 text-sm bg-bg-surface text-fg-primary placeholder:text-fg-muted border border-border-default rounded-[var(--radius-lg)]"
          autoFocus
        />
      </div>

      <div>
        <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
          Сумма
        </label>
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="0"
            className="w-full h-10 px-3 pr-8 text-sm bg-bg-surface text-fg-primary placeholder:text-fg-muted border border-border-default rounded-[var(--radius-lg)] font-medium tabular-nums"
          />
          <span className="absolute right-3 top-2.5 text-sm text-fg-muted">₽</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
            Категория
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full h-10 px-3 text-sm bg-bg-surface text-fg-primary border border-border-default rounded-[var(--radius-lg)]"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
            День месяца (1-31)
          </label>
          <input
            type="number"
            min={1}
            max={31}
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(parseInt(e.target.value) || 1)}
            className="w-full h-10 px-3 text-sm bg-bg-surface text-fg-primary border border-border-default rounded-[var(--radius-lg)]"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
          Чей расход
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOwner("shared")}
            className={cn(
              "flex-1 h-9 text-xs font-medium rounded-[var(--radius-md)] transition-colors",
              owner === "shared"
                ? "bg-accent-muted text-accent-text border border-accent/40"
                : "bg-bg-surface text-fg-secondary border border-border-default"
            )}
          >
            Общий
          </button>
          <button
            type="button"
            onClick={() => setOwner("person1")}
            className={cn(
              "flex-1 h-9 text-xs font-medium rounded-[var(--radius-md)] transition-colors",
              owner === "person1"
                ? "bg-accent-muted text-accent-text border border-accent/40"
                : "bg-bg-surface text-fg-secondary border border-border-default"
            )}
          >
            Алексей
          </button>
          <button
            type="button"
            onClick={() => setOwner("person2")}
            className={cn(
              "flex-1 h-9 text-xs font-medium rounded-[var(--radius-md)] transition-colors",
              owner === "person2"
                ? "bg-accent-muted text-accent-text border border-accent/40"
                : "bg-bg-surface text-fg-secondary border border-border-default"
            )}
          >
            Мария
          </button>
        </div>
      </div>

      <Button
        fullWidth
        size="lg"
        disabled={!name.trim() || !amount || amount === "0" || loading}
        onClick={handleSubmit}
      >
        {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
        Создать платёж
      </Button>
    </div>
  );
}
