import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getActiveHousehold } from "@/lib/db/household";

export async function GET() {
  try {
    const household = await getActiveHousehold();
    const now = new Date();

    // Last 6 months data
    const monthsData = [];
    const monthNames = [
      "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
      "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"
    ];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;

      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0, 23, 59, 59, 999);

      const txs = await prisma.transaction.findMany({
        where: {
          householdId: household.id,
          deletedAt: null,
          date: { gte: start, lte: end },
        },
      });

      const income = txs
        .filter((t) => t.type === "income")
        .reduce((sum, t) => sum + t.amount, 0);
      const expenses = txs
        .filter((t) => t.type === "expense")
        .reduce((sum, t) => sum + t.amount, 0);

      monthsData.push({
        month: monthNames[d.getMonth()],
        year,
        income,
        expenses,
        savings: income - expenses,
      });
    }

    // Categories breakdown across last 3 months
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const recentExpenses = await prisma.transaction.findMany({
      where: {
        householdId: household.id,
        deletedAt: null,
        type: "expense",
        date: { gte: threeMonthsAgo },
      },
      include: { category: true },
    });

    const categoryMap = new Map<string, { name: string; color: string; amount: number }>();
    let totalExpenseRecent = 0;

    for (const tx of recentExpenses) {
      totalExpenseRecent += tx.amount;
      const catName = tx.category?.name || "Другое";
      const catColor = tx.category?.color || "#71717a";
      const existing = categoryMap.get(catName) || { name: catName, color: catColor, amount: 0 };
      existing.amount += tx.amount;
      categoryMap.set(catName, existing);
    }

    const categories = Array.from(categoryMap.values())
      .map((c) => ({
        ...c,
        percentage: totalExpenseRecent > 0 ? Math.round((c.amount / totalExpenseRecent) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return NextResponse.json({
      history: monthsData,
      categories,
      totalExpenseRecent,
    });
  } catch (error) {
    console.error("Analytics GET error:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
