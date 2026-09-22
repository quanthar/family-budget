import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getActiveHousehold } from "@/lib/db/household";

export async function GET(request: Request) {
  try {
    const household = await getActiveHousehold();
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "csv"; // "csv" | "json"

    const transactions = await prisma.transaction.findMany({
      where: {
        householdId: household.id,
        deletedAt: null,
      },
      include: {
        category: true,
        member: true,
      },
      orderBy: { date: "desc" },
    });

    if (format === "json") {
      return NextResponse.json(transactions, {
        headers: {
          "Content-Disposition": `attachment; filename="transactions_${new Date().toISOString().slice(0, 10)}.json"`,
        },
      });
    }

    // CSV format
    const rows = [
      ["ID", "Дата", "Тип", "Сумма", "Категория", "Участник", "Описание"].join(";"),
    ];

    for (const tx of transactions) {
      const typeLabel = tx.type === "income" ? "Доход" : tx.type === "expense" ? "Расход" : "Перевод";
      const dateStr = tx.date.toISOString().slice(0, 10);
      const cat = tx.category?.name || "";
      const member = tx.member?.name || "";
      const desc = `"${(tx.description || "").replace(/"/g, '""')}"`;
      rows.push([tx.id, dateStr, typeLabel, tx.amount, cat, member, desc].join(";"));
    }

    const csvContent = "\uFEFF" + rows.join("\r\n"); // UTF-8 BOM for Excel

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="budget_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "Failed to export data" }, { status: 500 });
  }
}
