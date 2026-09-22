// ============================================
// Forecast Service
// Computes cash flow projections, upcoming timeline events,
// and projected balance at the end of the month.
// ============================================

import { RecurringInstance } from "./recurring";
import { PayoutDetail } from "./salary";

export interface CashFlowEvent {
  date: Date;
  dateLabel: string;
  amount: number;
  type: "income" | "expense";
  label: string;
  category?: string;
  isCompleted?: boolean;
}

export interface ForecastResult {
  currentBalance: number;
  expectedIncomeRemaining: number;
  expectedExpenseRemaining: number;
  projectedEndMonthBalance: number;
  timeline: CashFlowEvent[];
  progressPercent: number;
}

export class ForecastService {
  /**
   * Forecasts month end balance combining current balance with remaining salary & recurring payouts
   */
  static computeForecast(
    currentBalance: number,
    currentDate: Date,
    year: number,
    month: number, // 1-12
    salaryPayouts: Array<PayoutDetail & { memberName: string }>,
    recurringInstances: RecurringInstance[],
    averageDailyExpense: number = 0
  ): ForecastResult {
    const timeline: CashFlowEvent[] = [];
    let expectedIncomeRemaining = 0;
    let expectedExpenseRemaining = 0;

    // Remaining salary payouts in current month
    for (const payout of salaryPayouts) {
      const isPast = payout.actualDate < currentDate;
      timeline.push({
        date: payout.actualDate,
        dateLabel: formatDateLabel(payout.actualDate),
        amount: payout.amount,
        type: "income",
        label: `${payout.label} (${payout.memberName})`,
        category: "Зарплата",
        isCompleted: isPast,
      });

      if (!isPast) {
        expectedIncomeRemaining += payout.amount;
      }
    }

    // Remaining recurring expenses
    for (const inst of recurringInstances) {
      const isPast = inst.isPaid || inst.date < currentDate;
      timeline.push({
        date: inst.date,
        dateLabel: formatDateLabel(inst.date),
        amount: -inst.amount,
        type: "expense",
        label: inst.name,
        category: inst.categoryName,
        isCompleted: isPast,
      });

      if (!isPast && inst.type === "expense") {
        expectedExpenseRemaining += inst.amount;
      }
    }

    // Sort timeline chronologically
    timeline.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Remaining days in month
    const totalDaysInMonth = new Date(year, month, 0).getDate();
    const remainingDays = Math.max(0, totalDaysInMonth - currentDate.getDate());
    const expectedVariableExpenses = remainingDays * averageDailyExpense;

    const totalExpectedOutflow = expectedExpenseRemaining + expectedVariableExpenses;
    const projectedEndMonthBalance = Math.round(
      currentBalance + expectedIncomeRemaining - totalExpectedOutflow
    );

    // Progress bar percentage (how much of the month's target is achieved)
    const baseTarget = Math.max(projectedEndMonthBalance, 1);
    const progressPercent = Math.min(100, Math.max(0, Math.round((currentBalance / baseTarget) * 100)));

    return {
      currentBalance,
      expectedIncomeRemaining,
      expectedExpenseRemaining: Math.round(totalExpectedOutflow),
      projectedEndMonthBalance,
      timeline,
      progressPercent,
    };
  }
}

function formatDateLabel(d: Date): string {
  const months = [
    "янв", "фев", "мар", "апр", "май", "июн",
    "июл", "авг", "сен", "окт", "ноя", "дек"
  ];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}
