/* ============================================
   TYPES — Core domain types for Family Budget
   ============================================ */

// --- Enums ---

export type TransactionType = "income" | "expense" | "transfer";

export type SalaryType = "gross" | "net";

export type RecurringPeriod = "monthly" | "quarterly" | "yearly";

export type BudgetPeriodStatus = "planned" | "active" | "closed";

export type OwnerType = "person1" | "person2" | "shared";

export type IncomeType =
  | "salary"
  | "bonus"
  | "refund"
  | "freelance"
  | "gift"
  | "other";

export type PaymentDayTransferRule =
  | "previous_working_day"
  | "next_working_day";

// --- Core Models ---

export interface Household {
  id: string;
  name: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface HouseholdMember {
  id: string;
  householdId: string;
  name: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface SalarySettings {
  id: string;
  memberId: string;
  monthlySalary: number;
  salaryType: SalaryType;
  payDates: number[]; // e.g. [10, 25]
  payProportions: number[]; // e.g. [0.6, 0.4]
  transferRule: PaymentDayTransferRule;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface Category {
  id: string;
  householdId: string;
  name: string;
  icon: string;
  color: string;
  order: number;
  isDefault: boolean;
  isArchived: boolean;
}

export interface Transaction {
  id: string;
  householdId: string;
  type: TransactionType;
  amount: number;
  categoryId: string | null;
  memberId: string | null;
  targetMemberId: string | null; // for transfers
  date: string;
  description: string;
  incomeType: IncomeType | null;
  recurringRuleId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  // Joined fields
  category?: Category;
  member?: HouseholdMember;
  targetMember?: HouseholdMember;
}

export interface RecurringRule {
  id: string;
  householdId: string;
  name: string;
  type: TransactionType;
  amount: number;
  categoryId: string;
  memberId: string | null;
  owner: OwnerType;
  period: RecurringPeriod;
  dayOfMonth: number;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
  // Joined
  category?: Category;
  member?: HouseholdMember;
}

export interface BudgetPeriod {
  id: string;
  householdId: string;
  year: number;
  month: number; // 1-12
  status: BudgetPeriodStatus;
  snapshotData: BudgetSnapshot | null;
  createdAt: string;
  closedAt: string | null;
}

export interface BudgetSnapshot {
  totalIncome: number;
  totalExpenses: number;
  totalTransfers: number;
  balance: number;
  byCategory: { categoryId: string; amount: number }[];
  byMember: { memberId: string; income: number; expenses: number }[];
}

export interface ProductionCalendarDay {
  date: string;
  isWorking: boolean;
  isHoliday: boolean;
  holidayName?: string;
  isTransferredWorkday?: boolean;
  isTransferredWeekend?: boolean;
}

export interface ProductionCalendarMonth {
  year: number;
  month: number;
  workingDays: number;
  weekendDays: number;
  holidays: number;
  days: ProductionCalendarDay[];
}

export interface Notification {
  id: string;
  householdId: string;
  title: string;
  message: string;
  type: "salary" | "payment" | "budget" | "system";
  isRead: boolean;
  actionUrl: string | null;
  createdAt: string;
}

// --- Dashboard Aggregates ---

export interface DashboardData {
  currentBalance: number;
  totalIncome: number;
  totalExpenses: number;
  mandatoryExpensesRemaining: number;
  forecastEndOfMonth: number;
  incomeChange: number; // % vs last month
  expenseChange: number; // % vs last month
  byCategory: CategoryExpense[];
  byMember: MemberSummary[];
  cashFlow: CashFlowEvent[];
  insights: Insight[];
}

export interface CategoryExpense {
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  amount: number;
  percentage: number;
}

export interface MemberSummary {
  memberId: string;
  memberName: string;
  income: number;
  expenses: number;
  balance: number;
}

export interface CashFlowEvent {
  date: string;
  amount: number;
  type: TransactionType;
  label: string;
  isProjected: boolean;
}

export interface Insight {
  id: string;
  text: string;
  type: "info" | "warning" | "positive" | "neutral";
  priority: number;
}

// --- Forecast ---

export interface ForecastBreakdown {
  currentBalance: number;
  expectedIncome: number;
  plannedExpenses: number;
  mandatoryPayments: number;
  forecastBalance: number;
}

// --- Onboarding ---

export interface OnboardingData {
  member1Name: string;
  member2Name: string;
  member1Salary: number;
  member1SalaryType: SalaryType;
  member1PayDates: number[];
  member2Salary: number;
  member2SalaryType: SalaryType;
  member2PayDates: number[];
  recurringExpenses: {
    name: string;
    amount: number;
    dayOfMonth: number;
    categoryId: string;
  }[];
}
