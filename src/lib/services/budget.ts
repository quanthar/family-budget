// ============================================
// Budget Service
// Aggregates monthly totals, category breakdowns, member splits,
// and period comparisons.
// ============================================

export interface TransactionItem {
  id: string;
  type: string; // "income" | "expense" | "transfer"
  amount: number;
  date: Date;
  categoryId?: string | null;
  category?: {
    id: string;
    name: string;
    color: string;
    icon: string;
  } | null;
  memberId?: string | null;
  member?: {
    id: string;
    name: string;
  } | null;
}

export interface CategoryBreakdown {
  id: string;
  name: string;
  color: string;
  icon: string;
  amount: number;
  percentage: number;
}

export interface MemberSummary {
  id: string;
  name: string;
  income: number;
  expenses: number;
  balance: number;
}

export interface BudgetSummary {
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  incomeChange?: number; // % vs previous month
  expenseChange?: number; // % vs previous month
  byCategory: CategoryBreakdown[];
  members: MemberSummary[];
}

export class BudgetService {
  /**
   * Calculates comprehensive budget metrics for a month
   */
  static calculateSummary(
    currentMonthTx: TransactionItem[],
    prevMonthTx: TransactionItem[] = [],
    membersList: Array<{ id: string; name: string }> = []
  ): BudgetSummary {
    let totalIncome = 0;
    let totalExpenses = 0;

    const categoryMap = new Map<string, { id: string; name: string; color: string; icon: string; amount: number }>();
    const memberMap = new Map<string, { id: string; name: string; income: number; expenses: number }>();

    // Initialize all members
    for (const m of membersList) {
      memberMap.set(m.id, { id: m.id, name: m.name, income: 0, expenses: 0 });
    }

    for (const tx of currentMonthTx) {
      if (tx.type === "income") {
        totalIncome += tx.amount;
        if (tx.memberId && memberMap.has(tx.memberId)) {
          memberMap.get(tx.memberId)!.income += tx.amount;
        }
      } else if (tx.type === "expense") {
        totalExpenses += tx.amount;
        if (tx.memberId && memberMap.has(tx.memberId)) {
          memberMap.get(tx.memberId)!.expenses += tx.amount;
        }

        // Category breakdown
        const catId = tx.category?.id || "other";
        const catName = tx.category?.name || "Другое";
        const catColor = tx.category?.color || "#71717a";
        const catIcon = tx.category?.icon || "MoreHorizontal";

        const existing = categoryMap.get(catId) || {
          id: catId,
          name: catName,
          color: catColor,
          icon: catIcon,
          amount: 0,
        };
        existing.amount += tx.amount;
        categoryMap.set(catId, existing);
      }
    }

    // Previous month totals for comparison
    const prevIncome = prevMonthTx
      .filter((tx) => tx.type === "income")
      .reduce((sum, tx) => sum + tx.amount, 0);
    const prevExpenses = prevMonthTx
      .filter((tx) => tx.type === "expense")
      .reduce((sum, tx) => sum + tx.amount, 0);

    const incomeChange = prevIncome > 0 ? Math.round(((totalIncome - prevIncome) / prevIncome) * 100 * 10) / 10 : undefined;
    const expenseChange = prevExpenses > 0 ? Math.round(((totalExpenses - prevExpenses) / prevExpenses) * 100 * 10) / 10 : undefined;

    // Sort categories by amount desc and calculate %
    const byCategory: CategoryBreakdown[] = Array.from(categoryMap.values())
      .map((cat) => ({
        ...cat,
        percentage: totalExpenses > 0 ? Math.round((cat.amount / totalExpenses) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    const members: MemberSummary[] = Array.from(memberMap.values()).map((m) => ({
      id: m.id,
      name: m.name,
      income: m.income,
      expenses: m.expenses,
      balance: m.income - m.expenses,
    }));

    return {
      totalIncome,
      totalExpenses,
      balance: totalIncome - totalExpenses,
      incomeChange,
      expenseChange,
      byCategory,
      members,
    };
  }
}
