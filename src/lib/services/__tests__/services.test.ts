// ============================================
// Unit Tests for Core Business Logic Services
// Run with: npx tsx src/lib/services/__tests__/services.test.ts
// ============================================

import { ProductionCalendarService } from "../production-calendar";
import { SalaryService } from "../salary";
import { RecurringService } from "../recurring";
import { BudgetService } from "../budget";
import { ForecastService } from "../forecast";
import { InsightsService } from "../insights";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
  console.log(`✓ PASS: ${message}`);
}

async function runTests() {
  console.log("\n--- Testing ProductionCalendarService ---");
  // Test 1: Jan 1 is holiday
  assert(!ProductionCalendarService.isWorkingDay(new Date(2025, 0, 1)), "Jan 1, 2025 is not a working day");
  assert(!ProductionCalendarService.isWorkingDay(new Date(2025, 0, 7)), "Jan 7, 2025 (Christmas) is not a working day");

  // Test 2: Shifted payment if payment date falls on holiday/weekend
  // Jan 10, 2025 is Friday (working day)
  const jan10 = ProductionCalendarService.getActualPaymentDate(2025, 1, 10, "previous_working_day");
  assert(jan10.getDate() === 10, "Jan 10, 2025 remains Jan 10 (Friday is working)");

  // Feb 23, 2025 is Sunday -> should shift to Friday Feb 21
  const feb23 = ProductionCalendarService.getActualPaymentDate(2025, 2, 23, "previous_working_day");
  assert(feb23.getDate() === 21, `Feb 23, 2025 shifted to previous working day Feb 21 (got ${feb23.getDate()})`);

  console.log("\n--- Testing SalaryService ---");
  // Test 3: Gross to Net conversion (13% NDFL)
  assert(SalaryService.grossToNet(100000) === 87000, "100k gross is 87k net");
  assert(SalaryService.netToGross(87000) === 100000, "87k net is 100k gross");

  // Test 4: Advance and salary proportions
  const payouts = SalaryService.getMonthPayouts(
    {
      monthlySalary: 200000,
      salaryType: "net",
      payDates: [25, 10],
      payProportions: [0.4, 0.6],
    },
    2025,
    3 // March 2025
  );
  assert(payouts.length === 2, "March has 2 payouts");
  assert(payouts[0].amount === 80000, "Advance is 40% = 80,000");
  assert(payouts[1].amount === 120000, "Main salary is 60% = 120,000");

  console.log("\n--- Testing RecurringService ---");
  const sampleRule = {
    id: "mortgage-1",
    householdId: "hh-1",
    name: "Ипотека",
    type: "expense" as const,
    amount: 50000,
    categoryId: "housing",
    categoryName: "Жилье",
    owner: "shared" as const,
    period: "monthly" as const,
    dayOfMonth: 15,
    isActive: true,
    effectiveFrom: new Date(2025, 0, 1),
  };
  const instances = RecurringService.generateMonthlyInstances([sampleRule], 2025, 3);
  assert(instances.length === 1, "Generated 1 mortgage instance for March");
  assert(instances[0].amount === 50000, "Mortgage amount matches");
  assert(!instances[0].isPaid, "Mortgage is not yet paid");

  console.log("\n--- Testing BudgetService ---");
  const summary = BudgetService.calculateSummary(
    [
      { id: "1", type: "income", amount: 200000, date: new Date(), memberId: "m1" },
      { id: "2", type: "expense", amount: 30000, date: new Date(), category: { id: "c1", name: "Продукты", color: "#22c55e", icon: "ShoppingCart" } },
      { id: "3", type: "expense", amount: 50000, date: new Date(), category: { id: "c2", name: "Жилье", color: "#6366f1", icon: "Home" } },
    ],
    [],
    [{ id: "m1", name: "Алексей" }]
  );
  assert(summary.totalIncome === 200000, "Total income is 200,000");
  assert(summary.totalExpenses === 80000, "Total expenses is 80,000");
  assert(summary.balance === 120000, "Balance is 120,000");
  assert(summary.byCategory.length === 2, "Two expense categories detected");
  assert(summary.byCategory[0].name === "Жилье", "Top category is Жилье (50k > 30k)");

  console.log("\n--- Testing ForecastService & InsightsService ---");
  const forecast = ForecastService.computeForecast(
    100000, // current balance
    new Date(2025, 2, 5), // March 5
    2025,
    3,
    [{ ...payouts[0], memberName: "Алексей" }],
    instances,
    1000 // 1k daily expense
  );
  assert(forecast.timeline.length >= 2, "Timeline contains events");
  assert(forecast.expectedIncomeRemaining === 80000, "Expected income is 80k");
  assert(forecast.expectedExpenseRemaining > 50000, "Expected expenses include recurring + daily");

  const insights = InsightsService.generateInsights({
    currentDate: new Date(2025, 2, 5),
    timeline: forecast.timeline,
    categories: summary.byCategory,
    expenseChange: -10,
    freeBalance: 40000,
  });
  assert(insights.length > 0, "Insights were successfully generated");

  console.log("\n=========================================");
  console.log("ALL SERVICE TESTS PASSED SUCCESSFULLY! 🎉");
  console.log("=========================================\n");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
