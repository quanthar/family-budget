// ============================================
// Smart Insights Service
// Generates clear, fact-based insights for the family dashboard
// ============================================

import { CashFlowEvent } from "./forecast";
import { CategoryBreakdown } from "./budget";

export interface InsightItem {
  id: string;
  text: string;
  type: "info" | "positive" | "warning";
  actionLabel?: string;
  actionUrl?: string;
}

export class InsightsService {
  /**
   * Generates actionable insights based on financial status
   */
  static generateInsights(params: {
    currentDate: Date;
    timeline: CashFlowEvent[];
    categories: CategoryBreakdown[];
    expenseChange?: number;
    freeBalance: number;
  }): InsightItem[] {
    const insights: InsightItem[] = [];
    const { currentDate, timeline, categories, expenseChange, freeBalance } = params;

    // 1. Next Salary Insight
    const nextSalary = timeline.find(
      (ev) => ev.type === "income" && ev.date >= currentDate && !ev.isCompleted
    );
    if (nextSalary) {
      const diffMs = nextSalary.date.getTime() - currentDate.getTime();
      const days = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      if (days === 0) {
        insights.push({
          id: "salary-today",
          text: `Сегодня ожидается выплата: ${nextSalary.label}`,
          type: "positive",
        });
      } else if (days <= 1) {
        insights.push({
          id: "salary-tomorrow",
          text: `Завтра поступит ${nextSalary.label}`,
          type: "positive",
        });
      } else {
        insights.push({
          id: "salary-days",
          text: `До следующего поступления (${nextSalary.label}) осталось ${days} ${getDaysPlural(days)}`,
          type: "info",
        });
      }
    }

    // 2. Next Mandatory Expense Insight
    const nextExpense = timeline.find(
      (ev) => ev.type === "expense" && ev.date >= currentDate && !ev.isCompleted
    );
    if (nextExpense) {
      const diffMs = nextExpense.date.getTime() - currentDate.getTime();
      const days = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      if (days <= 3) {
        insights.push({
          id: "mandatory-near",
          text: `Внимание: через ${days} ${getDaysPlural(days)} списание "${nextExpense.label}" (${Math.abs(nextExpense.amount).toLocaleString("ru-RU")} ₽)`,
          type: "warning",
        });
      }
    }

    // 3. Month-over-month comparison
    if (expenseChange !== undefined) {
      if (expenseChange < -5) {
        insights.push({
          id: "expense-trend-good",
          text: `В этом месяце расходы на ${Math.abs(expenseChange)}% ниже, чем в прошлом за этот период`,
          type: "positive",
        });
      } else if (expenseChange > 15) {
        insights.push({
          id: "expense-trend-high",
          text: `Расходы в этом месяце превышают прошлый месяц на ${expenseChange}%`,
          type: "warning",
        });
      }
    }

    // 4. Top category share
    if (categories.length > 0 && categories[0].percentage >= 35) {
      const topCat = categories[0];
      insights.push({
        id: "top-category",
        text: `Категория «${topCat.name}» занимает ${topCat.percentage}% всех расходов месяца`,
        type: topCat.percentage > 50 ? "warning" : "info",
      });
    }

    // 5. Free cash insight
    if (freeBalance > 0) {
      insights.push({
        id: "free-cash",
        text: `Свободный остаток после всех запланированных платежей: ${freeBalance.toLocaleString("ru-RU")} ₽`,
        type: "positive",
      });
    }

    return insights;
  }
}

function getDaysPlural(n: number): string {
  const abs = Math.abs(n) % 100;
  const rem = abs % 10;
  if (abs > 10 && abs < 20) return "дней";
  if (rem > 1 && rem < 5) return "дня";
  if (rem === 1) return "день";
  return "дней";
}
