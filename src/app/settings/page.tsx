"use client";

import { useEffect, useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { SkeletonCard } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  Settings as SettingsIcon,
  Tag,
  Download,
  Plus,
  Trash2,
  Calendar,
  Save,
  Loader2,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";

interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
}

const PALETTE = [
  "#6366f1", // Indigo
  "#3b82f6", // Blue
  "#06b6d4", // Cyan
  "#22c55e", // Green
  "#eab308", // Yellow
  "#f97316", // Orange
  "#ef4444", // Red
  "#ec4899", // Pink
  "#a855f7", // Purple
  "#71717a", // Zinc
];

export default function SettingsPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState(PALETTE[0]);
  const [isAddingCat, setIsAddingCat] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const fetchCategories = useCallback(() => {
    fetch("/api/categories")
      .then((res) => res.json())
      .then((data) => {
        if (data.categories) setCategories(data.categories);
      })
      .catch((err) => console.error("Error loading categories:", err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCatName.trim(),
          color: newCatColor,
        }),
      });

      if (!res.ok) throw new Error("Create failed");

      setNewCatName("");
      setIsAddingCat(false);
      toast.success("Категория создана");
      fetchCategories();
    } catch {
      toast.error("Не удалось создать категорию");
    }
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    if (!confirm(`Архивировать категорию «${name}»?`)) return;

    try {
      const res = await fetch(`/api/categories?id=${id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Delete failed");

      toast.success("Категория архивирована");
      fetchCategories();
    } catch {
      toast.error("Не удалось архивировать категорию");
    }
  };

  const handleExport = (format: "csv" | "json") => {
    window.open(`/api/export?format=${format}`, "_blank");
    toast.success(`Экспорт ${format.toUpperCase()} запущен`);
  };

  const handleResetData = async () => {
    setResetting(true);
    try {
      const res = await fetch("/api/reset", { method: "POST" });
      if (!res.ok) throw new Error("Reset failed");

      toast.success("Все тестовые данные успешно удалены");
      setIsResetModalOpen(false);
      window.dispatchEvent(new CustomEvent("budget:reload"));
    } catch {
      toast.error("Не удалось сбросить данные");
    } finally {
      setResetting(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-5 animate-fade-in-up">
        {/* Header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-fg-primary flex items-center gap-2">
            <SettingsIcon className="text-accent" size={24} />
            <span>Настройки приложения</span>
          </h1>
          <p className="text-xs sm:text-sm text-fg-muted mt-0.5">
            Категории расходов, производственный календарь и экспорт данных
          </p>
        </div>

        {/* Categories management */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <CardHeader
              title="Категории расходов"
              subtitle="Настройка списка категорий и цветовых меток"
              action={<Tag size={18} className="text-accent" />}
            />
            <Button
              size="sm"
              onClick={() => setIsAddingCat(true)}
              className="flex items-center gap-1.5 text-xs"
            >
              <Plus size={14} />
              Новая категория
            </Button>
          </div>

          {loading ? (
            <SkeletonCard className="h-32" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between p-3 rounded-[var(--radius-lg)] bg-bg-surface/50 border border-border-default/50 group"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="text-sm font-medium text-fg-primary">
                      {cat.name}
                    </span>
                  </div>

                  <button
                    onClick={() => handleDeleteCategory(cat.id, cat.name)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-fg-muted hover:text-expense-text transition-opacity"
                    title="Удалить категорию"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Production calendar info */}
        <Card className="p-5 space-y-3">
          <CardHeader
            title="Производственный календарь"
            subtitle="Официальные праздники и переносы РФ (2025-2027)"
            action={<Calendar size={18} className="text-accent" />}
          />
          <p className="text-xs text-fg-secondary leading-relaxed">
            Приложение автоматически учитывает официальные переносы выходных и праздничных дней
            при расчёте дат выплаты аванса и заработной платы (ст. 136 ТК РФ: при совпадении дня
            выплаты с выходным или нерабочим праздничным днем выплата производится накануне этого дня).
          </p>
          <div className="flex items-center gap-2 pt-1">
            <Badge variant="income">База 2025–2027 активна</Badge>
            <Badge variant="neutral">Автоматический сдвиг дат</Badge>
          </div>
        </Card>

        {/* Export Data */}
        <Card className="p-5 space-y-4">
          <CardHeader
            title="Экспорт данных"
            subtitle="Выгрузка всех финансовых операций для резервного копирования или Excel"
            action={<Download size={18} className="text-accent" />}
          />

          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={() => handleExport("csv")}
              className="flex items-center gap-2"
            >
              <Download size={16} />
              Экспорт в Excel (CSV)
            </Button>

            <Button
              variant="secondary"
              onClick={() => handleExport("json")}
              className="flex items-center gap-2"
            >
              <Download size={16} />
              Экспорт в JSON
            </Button>
          </div>
        </Card>

        {/* Danger Zone: Reset test data */}
        <Card className="p-5 space-y-4 border-expense/30 bg-expense/5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-fg-primary flex items-center gap-2">
                <AlertTriangle size={18} className="text-expense" />
                <span>Сброс данных</span>
              </h2>
              <p className="text-xs text-fg-secondary mt-1 max-w-xl leading-relaxed">
                Удаление всех тестовых транзакций, истории и регулярных платежей в один клик. Настройки зарплаты, состав семьи и категории сохранятся, позволяя сразу начать вести реальный бюджет.
              </p>
            </div>

            <Button
              variant="danger"
              onClick={() => setIsResetModalOpen(true)}
              className="shrink-0 flex items-center gap-2 text-xs border border-expense/30"
            >
              <RotateCcw size={15} />
              Сбросить все данные
            </Button>
          </div>
        </Card>

        {/* Add Category Modal */}
        {isAddingCat && (
          <Modal
            isOpen
            onClose={() => setIsAddingCat(false)}
            title="Новая категория"
            size="sm"
          >
            <div className="space-y-4">
              <div>
                <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
                  Название
                </label>
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Например: Кафе и рестораны"
                  className="w-full h-10 px-3 text-sm bg-bg-surface text-fg-primary border border-border-default rounded-[var(--radius-lg)]"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
                  Цвет
                </label>
                <div className="flex flex-wrap gap-2">
                  {PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewCatColor(color)}
                      className={cn(
                        "w-7 h-7 rounded-full transition-transform",
                        newCatColor === color && "ring-2 ring-white scale-110"
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <Button
                fullWidth
                size="lg"
                disabled={!newCatName.trim()}
                onClick={handleCreateCategory}
              >
                Создать категорию
              </Button>
            </div>
          </Modal>
        )}

        {/* Reset Confirmation Modal */}
        {isResetModalOpen && (
          <Modal
            isOpen
            onClose={() => !resetting && setIsResetModalOpen(false)}
            title="Сбросить все тестовые данные?"
            size="md"
            closeOnBackdropClick={!resetting}
          >
            <div className="space-y-4">
              <div className="p-3.5 rounded-[var(--radius-lg)] bg-expense/10 border border-expense/20 text-xs text-fg-secondary space-y-2">
                <p className="font-semibold text-expense-text flex items-center gap-1.5">
                  <AlertTriangle size={14} />
                  Внимание: это действие необратимо!
                </p>
                <p>Будут удалены:</p>
                <ul className="list-disc list-inside space-y-1 text-fg-muted pl-1">
                  <li>Все доходы, расходы и переводы (тестовая история)</li>
                  <li>Все тестовые регулярные платежи и подписки</li>
                  <li>Периоды бюджета и архивная статистика</li>
                </ul>
                <p className="text-[11px] text-fg-secondary pt-1 font-medium">
                  ✓ Имена членов семьи, настройки зарплат и категории расходов останутся без изменений.
                </p>
              </div>

              <div className="flex gap-2.5 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  disabled={resetting}
                  onClick={() => setIsResetModalOpen(false)}
                >
                  Отмена
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  className="flex-1 border border-expense/30"
                  disabled={resetting}
                  onClick={handleResetData}
                >
                  {resetting ? (
                    <Loader2 className="animate-spin mr-2" size={16} />
                  ) : (
                    <Trash2 size={16} className="mr-2" />
                  )}
                  Да, сбросить всё
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </AppLayout>
  );
}
