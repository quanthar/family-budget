"use client";

import { useEffect, useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { AmountDisplay } from "@/components/ui/amount-display";
import { SkeletonCard } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  Users,
  Settings2,
  Calendar,
  Wallet,
  Briefcase,
  Shield,
  Loader2,
} from "lucide-react";

interface Member {
  id: string;
  name: string;
  salarySettings?: Array<{
    id: string;
    monthlySalary: number;
    salaryType: string;
    payDates: string; // JSON: [25, 10]
    payProportions: string; // JSON: [0.4, 0.6]
    transferRule: string;
  }>;
}

export default function PeoplePage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMember, setEditingMember] = useState<Member | null>(null);

  const fetchMembers = useCallback(() => {
    fetch("/api/members")
      .then((res) => res.json())
      .then((json) => {
        if (json.members) setMembers(json.members);
      })
      .catch((err) => console.error("Error loading members:", err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-5 animate-fade-in-up">
        {/* Header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-fg-primary flex items-center gap-2">
            <Users className="text-accent" size={24} />
            <span>Участники семьи</span>
          </h1>
          <p className="text-xs sm:text-sm text-fg-muted mt-0.5">
            Управление доходами, датами выплат и зарплатными параметрами
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SkeletonCard className="h-64" />
            <SkeletonCard className="h-64" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {members.map((member) => {
              const setting = member.salarySettings?.[0];
              const salary = setting?.monthlySalary || 0;
              const isNet = setting?.salaryType !== "gross";

              let payDates = [25, 10];
              let payProps = [0.4, 0.6];
              try {
                if (setting?.payDates) payDates = JSON.parse(setting.payDates);
                if (setting?.payProportions) payProps = JSON.parse(setting.payProportions);
              } catch {}

              const advanceAmount = Math.round(salary * (payProps[0] || 0.4));
              const mainAmount = salary - advanceAmount;

              return (
                <Card key={member.id} className="p-5 space-y-4 relative">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-fg-primary">
                        {member.name}
                      </h2>
                      <p className="text-xs text-fg-muted">
                        Участник семейного бюджета
                      </p>
                    </div>

                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setEditingMember(member)}
                      className="flex items-center gap-1.5 text-xs"
                    >
                      <Settings2 size={14} />
                      Настроить
                    </Button>
                  </div>

                  <div className="p-3.5 bg-bg-surface/60 rounded-[var(--radius-lg)] border border-border-default/40 space-y-2">
                    <div className="text-xs text-fg-tertiary uppercase tracking-wider">
                      Зарплата в месяц ({isNet ? "на руки" : "до вычета"})
                    </div>
                    <AmountDisplay amount={salary} size="lg" colorize={false} />
                  </div>

                  {/* Payouts schedule */}
                  <div className="space-y-2 text-xs">
                    <div className="font-semibold text-fg-secondary">
                      График выплат:
                    </div>

                    <div className="flex items-center justify-between p-2 rounded bg-bg-surface/30">
                      <span className="text-fg-muted flex items-center gap-1.5">
                        <Calendar size={13} className="text-accent" />
                        Аванс ({payDates[0]}-го числа, {Math.round((payProps[0] || 0.4) * 100)}%)
                      </span>
                      <span className="font-medium text-fg-primary">
                        {advanceAmount.toLocaleString("ru-RU")} ₽
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded bg-bg-surface/30">
                      <span className="text-fg-muted flex items-center gap-1.5">
                        <Calendar size={13} className="text-accent" />
                        Зарплата ({payDates[1]}-го числа, {Math.round((payProps[1] || 0.6) * 100)}%)
                      </span>
                      <span className="font-medium text-fg-primary">
                        {mainAmount.toLocaleString("ru-RU")} ₽
                      </span>
                    </div>

                    <div className="pt-2 text-[11px] text-fg-muted flex items-center gap-1">
                      <Shield size={12} className="text-accent-text" />
                      <span>
                        Перенос при выходных:{" "}
                        <strong className="text-fg-secondary">предыдущий рабочий день</strong>
                      </span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Edit Member Modal */}
        {editingMember && (
          <EditMemberModal
            member={editingMember}
            onClose={() => setEditingMember(null)}
            onSuccess={() => {
              setEditingMember(null);
              fetchMembers();
              window.dispatchEvent(new CustomEvent("budget:reload"));
            }}
          />
        )}
      </div>
    </AppLayout>
  );
}

function EditMemberModal({
  member,
  onClose,
  onSuccess,
}: {
  member: Member;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const setting = member.salarySettings?.[0];
  const [name, setName] = useState(member.name);
  const [salary, setSalary] = useState(String(setting?.monthlySalary || "150000"));
  const [salaryType, setSalaryType] = useState(setting?.salaryType || "net");
  const [advanceDay, setAdvanceDay] = useState("25");
  const [salaryDay, setSalaryDay] = useState("10");
  const [advancePct, setAdvancePct] = useState(40);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (setting?.payDates) {
      try {
        const dates = JSON.parse(setting.payDates);
        setAdvanceDay(dates[0] !== undefined ? String(dates[0]) : "25");
        setSalaryDay(dates[1] !== undefined ? String(dates[1]) : "10");
      } catch {}
    }
    if (setting?.payProportions) {
      try {
        const props = JSON.parse(setting.payProportions);
        setAdvancePct(Math.round((props[0] || 0.4) * 100));
      } catch {}
    }
  }, [setting]);

  const handleSave = async () => {
    const numSalary = parseFloat(salary);
    if (!name.trim() || isNaN(numSalary) || numSalary <= 0) {
      toast.error("Укажите корректную сумму зарплаты");
      return;
    }

    const adv = parseInt(advanceDay, 10);
    const sal = parseInt(salaryDay, 10);
    const validAdvance = isNaN(adv) ? 25 : Math.min(31, Math.max(1, adv));
    const validSalary = isNaN(sal) ? 10 : Math.min(31, Math.max(1, sal));

    setLoading(true);
    try {
      const res = await fetch("/api/members", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: member.id,
          name: name.trim(),
          salarySettings: {
            monthlySalary: numSalary,
            salaryType,
            payDates: [validAdvance, validSalary],
            payProportions: [advancePct / 100, (100 - advancePct) / 100],
            transferRule: "previous_working_day",
          },
        }),
      });

      if (!res.ok) throw new Error("Save failed");

      toast.success("Настройки зарплаты сохранены");
      onSuccess();
    } catch {
      toast.error("Не удалось сохранить настройки");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Настройки: ${member.name}`}
      size="md"
      closeOnBackdropClick={false}
    >
      <div className="space-y-4">
        <div>
          <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
            Имя
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full h-10 px-3 text-sm bg-bg-surface text-fg-primary border border-border-default rounded-[var(--radius-lg)] focus:outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
            Сумма зарплаты в месяц
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={salary}
              onChange={(e) => setSalary(e.target.value.replace(/[^\d]/g, ""))}
              className="w-full h-10 px-3 pr-8 text-sm bg-bg-surface text-fg-primary border border-border-default rounded-[var(--radius-lg)] font-medium tabular-nums focus:outline-none focus:border-accent"
            />
            <span className="absolute right-3 top-2.5 text-sm text-fg-muted">₽</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setSalaryType("net")}
            className={cn(
              "h-9 text-xs font-medium rounded-[var(--radius-lg)] border transition-colors",
              salaryType === "net"
                ? "bg-accent-muted text-accent-text border-accent/40"
                : "bg-bg-surface text-fg-secondary border-border-default"
            )}
          >
            На руки (чистыми)
          </button>
          <button
            type="button"
            onClick={() => setSalaryType("gross")}
            className={cn(
              "h-9 text-xs font-medium rounded-[var(--radius-lg)] border transition-colors",
              salaryType === "gross"
                ? "bg-accent-muted text-accent-text border-accent/40"
                : "bg-bg-surface text-fg-secondary border-border-default"
            )}
          >
            До вычета НДФЛ 13%
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
              День аванса (число)
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={2}
              placeholder="25"
              value={advanceDay}
              onChange={(e) => setAdvanceDay(e.target.value.replace(/[^\d]/g, ""))}
              className="w-full h-10 px-3 text-sm bg-bg-surface text-fg-primary border border-border-default rounded-[var(--radius-lg)] font-medium tabular-nums focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
              День зарплаты (число)
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={2}
              placeholder="10"
              value={salaryDay}
              onChange={(e) => setSalaryDay(e.target.value.replace(/[^\d]/g, ""))}
              className="w-full h-10 px-3 text-sm bg-bg-surface text-fg-primary border border-border-default rounded-[var(--radius-lg)] font-medium tabular-nums focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
            Доля аванса: {advancePct}% (остаток: {100 - advancePct}%)
          </label>
          <input
            type="range"
            min={10}
            max={90}
            step={5}
            value={advancePct}
            onChange={(e) => setAdvancePct(parseInt(e.target.value))}
            className="w-full accent-accent"
          />
        </div>

        <div className="flex gap-2.5 pt-2">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={onClose}
          >
            Отмена
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={!name.trim() || !salary || loading}
            onClick={handleSave}
          >
            {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
            Сохранить изменения
          </Button>
        </div>
      </div>
    </Modal>
  );
}
