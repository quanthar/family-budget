"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  Users,
  Wallet,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Calendar,
  Sparkles,
  Loader2,
} from "lucide-react";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Form states
  const [familyName, setFamilyName] = useState("Наша семья");
  const [p1Name, setP1Name] = useState("Алексей");
  const [p2Name, setP2Name] = useState("Мария");

  const [p1Salary, setP1Salary] = useState("200000");
  const [p1AdvanceDay, setP1AdvanceDay] = useState(25);
  const [p1SalaryDay, setP1SalaryDay] = useState(10);

  const [p2Salary, setP2Salary] = useState("120000");
  const [p2AdvanceDay, setP2AdvanceDay] = useState(20);
  const [p2SalaryDay, setP2SalaryDay] = useState(5);

  const [rent, setRent] = useState("50000");
  const [utilities, setUtilities] = useState("7000");
  const [internet, setInternet] = useState("900");

  const handleFinish = async () => {
    setLoading(true);
    try {
      // 1. Update members names & salaries
      const membersRes = await fetch("/api/members");
      const membersData = await membersRes.json();

      if (membersData.members && membersData.members.length >= 2) {
        // Update person 1
        await fetch("/api/members", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: membersData.members[0].id,
            name: p1Name,
            salarySettings: {
              monthlySalary: parseFloat(p1Salary) || 200000,
              salaryType: "net",
              payDates: [p1AdvanceDay, p1SalaryDay],
              payProportions: [0.4, 0.6],
              transferRule: "previous_working_day",
            },
          }),
        });

        // Update person 2
        await fetch("/api/members", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: membersData.members[1].id,
            name: p2Name,
            salarySettings: {
              monthlySalary: parseFloat(p2Salary) || 120000,
              salaryType: "net",
              payDates: [p2AdvanceDay, p2SalaryDay],
              payProportions: [0.4, 0.6],
              transferRule: "previous_working_day",
            },
          }),
        });
      }

      toast.success("Бюджет успешно настроен!");
      router.push("/");
    } catch {
      toast.error("Ошибка при сохранении, переходим в приложение");
      router.push("/");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-app flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-lg space-y-6 animate-fade-in-up">
        {/* Progress indicator */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-fg-muted font-medium">
            <span>Шаг {step} из 5</span>
            <span>
              {step === 1 && "Семья"}
              {step === 2 && "Участники"}
              {step === 3 && "Доходы"}
              {step === 4 && "Обязательства"}
              {step === 5 && "Готово"}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  step >= i ? "bg-accent" : "bg-bg-surface"
                )}
              />
            ))}
          </div>
        </div>

        <Card className="p-6 sm:p-7 space-y-5">
          {/* Step 1: Welcome & Family Name */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="w-12 h-12 bg-accent/20 text-accent rounded-[var(--radius-xl)] flex items-center justify-center border border-accent/30">
                <Users size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-fg-primary">
                  Добро пожаловать в Семейный Бюджет
                </h2>
                <p className="text-xs text-fg-secondary mt-1">
                  Приложение разработано для ведения общего бюджета двумя людьми с учётом
                  двух зарплат, графиков авансов и производственного календаря.
                </p>
              </div>

              <div>
                <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
                  Название семьи / профиля
                </label>
                <input
                  type="text"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  className="w-full h-10 px-3 text-sm bg-bg-surface text-fg-primary border border-border-default rounded-[var(--radius-lg)] outline-none focus:border-accent"
                />
              </div>

              <Button
                fullWidth
                size="lg"
                onClick={() => setStep(2)}
                className="flex items-center justify-center gap-2 mt-4"
              >
                <span>Далее: участники</span>
                <ArrowRight size={16} />
              </Button>
            </div>
          )}

          {/* Step 2: Names of 2 partners */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-fg-primary">
                  Кто ведёт бюджет?
                </h2>
                <p className="text-xs text-fg-secondary mt-1">
                  Укажите имена двух участников семьи
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
                    Первый участник
                  </label>
                  <input
                    type="text"
                    value={p1Name}
                    onChange={(e) => setP1Name(e.target.value)}
                    className="w-full h-10 px-3 text-sm bg-bg-surface text-fg-primary border border-border-default rounded-[var(--radius-lg)]"
                  />
                </div>

                <div>
                  <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
                    Второй участник
                  </label>
                  <input
                    type="text"
                    value={p2Name}
                    onChange={(e) => setP2Name(e.target.value)}
                    className="w-full h-10 px-3 text-sm bg-bg-surface text-fg-primary border border-border-default rounded-[var(--radius-lg)]"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="secondary" onClick={() => setStep(1)} className="flex-1">
                  Назад
                </Button>
                <Button onClick={() => setStep(3)} className="flex-1">
                  Далее
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Salaries */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-fg-primary">
                  Доходы и зарплаты
                </h2>
                <p className="text-xs text-fg-secondary mt-1">
                  Ежемесячные доходы (на руки) и стандартные даты выплат
                </p>
              </div>

              <div className="space-y-4">
                {/* Person 1 */}
                <div className="p-3 bg-bg-surface/60 rounded-[var(--radius-lg)] border border-border-default/50 space-y-2">
                  <span className="text-xs font-semibold text-fg-primary block">
                    {p1Name}
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-fg-tertiary block mb-1">
                        Зарплата (мес)
                      </label>
                      <input
                        type="text"
                        value={p1Salary}
                        onChange={(e) => setP1Salary(e.target.value.replace(/[^\d]/g, ""))}
                        className="w-full h-9 px-2 text-sm bg-bg-elevated border border-border-default rounded-[var(--radius-md)]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-fg-tertiary block mb-1">
                        Даты (аванс / зп)
                      </label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          value={p1AdvanceDay}
                          onChange={(e) => setP1AdvanceDay(parseInt(e.target.value) || 25)}
                          className="w-1/2 h-9 px-1 text-center text-xs bg-bg-elevated border border-border-default rounded-[var(--radius-md)]"
                        />
                        <input
                          type="number"
                          value={p1SalaryDay}
                          onChange={(e) => setP1SalaryDay(parseInt(e.target.value) || 10)}
                          className="w-1/2 h-9 px-1 text-center text-xs bg-bg-elevated border border-border-default rounded-[var(--radius-md)]"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Person 2 */}
                <div className="p-3 bg-bg-surface/60 rounded-[var(--radius-lg)] border border-border-default/50 space-y-2">
                  <span className="text-xs font-semibold text-fg-primary block">
                    {p2Name}
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-fg-tertiary block mb-1">
                        Зарплата (мес)
                      </label>
                      <input
                        type="text"
                        value={p2Salary}
                        onChange={(e) => setP2Salary(e.target.value.replace(/[^\d]/g, ""))}
                        className="w-full h-9 px-2 text-sm bg-bg-elevated border border-border-default rounded-[var(--radius-md)]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-fg-tertiary block mb-1">
                        Даты (аванс / зп)
                      </label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          value={p2AdvanceDay}
                          onChange={(e) => setP2AdvanceDay(parseInt(e.target.value) || 20)}
                          className="w-1/2 h-9 px-1 text-center text-xs bg-bg-elevated border border-border-default rounded-[var(--radius-md)]"
                        />
                        <input
                          type="number"
                          value={p2SalaryDay}
                          onChange={(e) => setP2SalaryDay(parseInt(e.target.value) || 5)}
                          className="w-1/2 h-9 px-1 text-center text-xs bg-bg-elevated border border-border-default rounded-[var(--radius-md)]"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="secondary" onClick={() => setStep(2)} className="flex-1">
                  Назад
                </Button>
                <Button onClick={() => setStep(4)} className="flex-1">
                  Далее
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Mandatory expenses */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-fg-primary">
                  Обязательные расходы
                </h2>
                <p className="text-xs text-fg-secondary mt-1">
                  Постоянные ежемесячные списания
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1">
                    Жильё / Ипотека / Аренда (₽)
                  </label>
                  <input
                    type="text"
                    value={rent}
                    onChange={(e) => setRent(e.target.value.replace(/[^\d]/g, ""))}
                    className="w-full h-10 px-3 text-sm bg-bg-surface text-fg-primary border border-border-default rounded-[var(--radius-lg)]"
                  />
                </div>

                <div>
                  <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1">
                    ЖКХ и коммуналка (₽)
                  </label>
                  <input
                    type="text"
                    value={utilities}
                    onChange={(e) => setUtilities(e.target.value.replace(/[^\d]/g, ""))}
                    className="w-full h-10 px-3 text-sm bg-bg-surface text-fg-primary border border-border-default rounded-[var(--radius-lg)]"
                  />
                </div>

                <div>
                  <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1">
                    Интернет и связь (₽)
                  </label>
                  <input
                    type="text"
                    value={internet}
                    onChange={(e) => setInternet(e.target.value.replace(/[^\d]/g, ""))}
                    className="w-full h-10 px-3 text-sm bg-bg-surface text-fg-primary border border-border-default rounded-[var(--radius-lg)]"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="secondary" onClick={() => setStep(3)} className="flex-1">
                  Назад
                </Button>
                <Button onClick={() => setStep(5)} className="flex-1">
                  Далее
                </Button>
              </div>
            </div>
          )}

          {/* Step 5: Ready */}
          {step === 5 && (
            <div className="space-y-4 text-center py-3">
              <div className="w-14 h-14 bg-income-muted text-income-text rounded-full flex items-center justify-center mx-auto border border-income/30 shadow-lg">
                <CheckCircle2 size={32} />
              </div>

              <div>
                <h2 className="text-xl font-bold text-fg-primary">
                  Всё готово к работе!
                </h2>
                <p className="text-xs text-fg-secondary mt-1 max-w-sm mx-auto">
                  Система рассчитала прогноз до конца месяца с учётом всех дат выплат
                  и производственного календаря.
                </p>
              </div>

              <div className="p-3 bg-bg-surface/60 rounded-[var(--radius-lg)] border border-border-default/40 text-left text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-fg-muted">Семья:</span>
                  <span className="font-semibold text-fg-primary">{familyName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-fg-muted">Участники:</span>
                  <span className="font-semibold text-fg-primary">
                    {p1Name} и {p2Name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-fg-muted">Совокупный доход:</span>
                  <span className="font-semibold text-income-text">
                    {(parseInt(p1Salary || "0") + parseInt(p2Salary || "0")).toLocaleString("ru-RU")} ₽/мес
                  </span>
                </div>
              </div>

              <Button
                fullWidth
                size="lg"
                disabled={loading}
                onClick={handleFinish}
                className="mt-3 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                Перейти в панель управления
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
