import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getActiveHousehold } from "@/lib/db/household";
import { BudgetService } from "@/lib/services/budget";
import { RecurringService, RecurringRuleData } from "@/lib/services/recurring";
import { SalaryService, PayoutDetail } from "@/lib/services/salary";
import { ForecastService } from "@/lib/services/forecast";
import { InsightsService } from "@/lib/services/insights";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const year = parseInt(searchParams.get("year") || String(now.getFullYear()), 10);
    const month = parseInt(searchParams.get("month") || String(now.getMonth() + 1), 10);

    const household = await getActiveHousehold();

    // Start & End of current month
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    // Start & End of previous month
    const prevMonthDate = new Date(year, month - 2, 1);
    const prevYear = prevMonthDate.getFullYear();
    const prevMonth = prevMonthDate.getMonth() + 1;
    const startOfPrevMonth = new Date(prevYear, prevMonth - 1, 1);
    const endOfPrevMonth = new Date(prevYear, prevMonth, 0, 23, 59, 59, 999);

    // Current month transactions
    const transactions = await prisma.transaction.findMany({
      where: {
        householdId: household.id,
        deletedAt: null,
        date: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      include: {
        category: true,
        member: true,
      },
      orderBy: { date: "desc" },
    });

    // Previous month transactions
    const prevTransactions = await prisma.transaction.findMany({
      where: {
        householdId: household.id,
        deletedAt: null,
        date: {
          gte: startOfPrevMonth,
          lte: endOfPrevMonth,
        },
      },
      include: {
        category: true,
        member: true,
      },
    });

    // Recurring rules
    const rulesFromDb = await prisma.recurringRule.findMany({
      where: {
        householdId: household.id,
        isActive: true,
      },
      include: {
        category: true,
      },
    });

    const recurringRules: RecurringRuleData[] = rulesFromDb.map((r) => ({
      id: r.id,
      householdId: r.householdId,
      name: r.name,
      type: r.type as "income" | "expense",
      amount: r.amount,
      categoryId: r.categoryId,
      categoryName: r.category?.name,
      categoryColor: r.category?.color,
      memberId: r.memberId,
      owner: r.owner as "person1" | "person2" | "shared",
      period: r.period as "monthly" | "quarterly" | "yearly",
      dayOfMonth: r.dayOfMonth,
      isActive: r.isActive,
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
    }));

    // Members with salary settings
    const membersList = household.members.map((m) => ({ id: m.id, name: m.name }));

    // Compute Summary
    const summary = BudgetService.calculateSummary(transactions, prevTransactions, membersList);

    // Compute Recurring Instances
    const recurringInstances = RecurringService.generateMonthlyInstances(
      recurringRules,
      year,
      month,
      transactions
    );

    const mandatoryRemaining = RecurringService.getMandatoryRemaining(recurringInstances, now);

    // Compute Salary payouts
    const allPayouts: Array<PayoutDetail & { memberName: string }> = [];
    for (const member of household.members) {
      const setting = member.salarySettings[0];
      if (setting) {
        let payDates = [25, 10];
        let payProportions = [0.4, 0.6];
        try {
          payDates = JSON.parse(setting.payDates);
          payProportions = JSON.parse(setting.payProportions);
        } catch {
          // fallback
        }

        const payouts = SalaryService.getMonthPayouts(
          {
            monthlySalary: setting.monthlySalary,
            salaryType: setting.salaryType as "gross" | "net",
            payDates,
            payProportions,
            transferRule: setting.transferRule as "previous_working_day" | "next_working_day",
          },
          year,
          month
        );

        payouts.forEach((p) => {
          allPayouts.push({ ...p, memberName: member.name });
        });
      }
    }

    // Compute Forecast
    const forecast = ForecastService.computeForecast(
      summary.balance,
      now,
      year,
      month,
      allPayouts,
      recurringInstances
    );

    // Compute Insights
    const freeBalance = summary.balance - mandatoryRemaining;
    const insights = InsightsService.generateInsights({
      currentDate: now,
      timeline: forecast.timeline,
      categories: summary.byCategory,
      expenseChange: summary.expenseChange,
      freeBalance,
    });

    return NextResponse.json({
      household: {
        id: household.id,
        name: household.name,
        currency: household.currency,
      },
      period: { year, month },
      summary: {
        ...summary,
        mandatoryRemaining,
        freeBalance,
      },
      forecast,
      recurringInstances,
      insights,
    });
  } catch (error) {
    console.error("Dashboard API error:", error);
    return NextResponse.json({ error: "Failed to load dashboard data" }, { status: 500 });
  }
}
