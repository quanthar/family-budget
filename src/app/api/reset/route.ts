import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getActiveHousehold } from "@/lib/db/household";

export async function POST() {
  try {
    const household = await getActiveHousehold();

    // 1. Delete all transactions (history, transfers, salary payouts)
    await prisma.transaction.deleteMany({
      where: { householdId: household.id },
    });

    // 2. Delete recurring rules (demo subscriptions, rent, etc.)
    await prisma.recurringRule.deleteMany({
      where: { householdId: household.id },
    });

    // 3. Delete budget period snapshots
    await prisma.budgetPeriod.deleteMany({
      where: { householdId: household.id },
    });

    // 4. Delete notifications
    await prisma.notification.deleteMany({
      where: { householdId: household.id },
    });

    return NextResponse.json({
      success: true,
      message: "Все тестовые данные (операции, регулярные платежи, периоды) успешно очищены",
    });
  } catch (error) {
    console.error("Reset data error:", error);
    return NextResponse.json(
      { error: "Не удалось выполнить сброс данных" },
      { status: 500 }
    );
  }
}
