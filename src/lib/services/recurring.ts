// ============================================
// Recurring Rules & Expenses Service
// Manages recurring rules, schedule generation, and payment status
// ============================================

export interface RecurringRuleData {
  id: string;
  householdId: string;
  name: string;
  type: "income" | "expense";
  amount: number;
  categoryId: string;
  categoryName?: string;
  categoryColor?: string;
  memberId?: string | null;
  owner: "person1" | "person2" | "shared";
  period: "monthly" | "quarterly" | "yearly";
  dayOfMonth: number;
  isActive: boolean;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
}

export interface RecurringInstance {
  ruleId: string;
  name: string;
  amount: number;
  type: "income" | "expense";
  date: Date;
  dayOfMonth?: number;
  categoryId: string;
  categoryName?: string;
  categoryColor?: string;
  owner: string;
  isPaid: boolean;
  paidAmount?: number;
  transactionId?: string;
}

export class RecurringService {
  /**
   * Check if a rule applies to a specific year and month (1-12)
   */
  static isRuleActiveInMonth(rule: RecurringRuleData, year: number, month: number): boolean {
    if (!rule.isActive) return false;

    const start = new Date(rule.effectiveFrom);
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0);

    if (start > monthEnd) return false;
    if (rule.effectiveTo && new Date(rule.effectiveTo) < monthStart) return false;

    if (rule.period === "monthly") {
      return true;
    }

    if (rule.period === "quarterly") {
      // Quarter months: usually 1, 4, 7, 10 or based on effectiveFrom
      const startMonth = start.getMonth() + 1;
      return (month - startMonth) % 3 === 0;
    }

    if (rule.period === "yearly") {
      const startMonth = start.getMonth() + 1;
      return month === startMonth;
    }

    return true;
  }

  /**
   * Generates instance date for a given year and month (handles short months like Feb)
   */
  static getInstanceDate(dayOfMonth: number, year: number, month: number): Date {
    const daysInMonth = new Date(year, month, 0).getDate();
    const safeDay = Math.min(dayOfMonth, daysInMonth);
    return new Date(year, month - 1, safeDay);
  }

  /**
   * Generates all expected instances for the given month from a set of rules
   */
  static generateMonthlyInstances(
    rules: RecurringRuleData[],
    year: number,
    month: number,
    existingTransactions: Array<{ id: string; recurringRuleId?: string | null; amount: number; date: Date }> = []
  ): RecurringInstance[] {
    const instances: RecurringInstance[] = [];

    for (const rule of rules) {
      if (!this.isRuleActiveInMonth(rule, year, month)) continue;

      const date = this.getInstanceDate(rule.dayOfMonth, year, month);

      // Check if matched transaction already exists
      const match = existingTransactions.find(
        (tx) => tx.recurringRuleId === rule.id
      );

      instances.push({
        ruleId: rule.id,
        name: rule.name,
        amount: rule.amount,
        type: rule.type,
        date,
        dayOfMonth: rule.dayOfMonth,
        categoryId: rule.categoryId,
        categoryName: rule.categoryName,
        categoryColor: rule.categoryColor,
        owner: rule.owner,
        isPaid: Boolean(match),
        paidAmount: match?.amount,
        transactionId: match?.id,
      });
    }

    // Sort by date ascending
    return instances.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  /**
   * Total mandatory remaining for the month (unpaid instances)
   */
  static getMandatoryRemaining(instances: RecurringInstance[], currentDate: Date = new Date()): number {
    return instances
      .filter((inst) => inst.type === "expense" && !inst.isPaid && inst.date >= currentDate)
      .reduce((sum, inst) => sum + inst.amount, 0);
  }
}
