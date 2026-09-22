import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getActiveHousehold } from "@/lib/db/household";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const household = await getActiveHousehold();

    const type = searchParams.get("type"); // income | expense | transfer | all
    const categoryId = searchParams.get("categoryId");
    const memberId = searchParams.get("memberId");
    const search = searchParams.get("search");
    const month = searchParams.get("month");
    const year = searchParams.get("year");
    const limit = parseInt(searchParams.get("limit") || "100", 10);

    // Build Prisma where filter
    const where: Record<string, unknown> = {
      householdId: household.id,
      deletedAt: null,
    };

    if (type && type !== "all") {
      where.type = type;
    }
    if (categoryId && categoryId !== "all") {
      where.categoryId = categoryId;
    }
    if (memberId && memberId !== "all") {
      where.memberId = memberId;
    }
    if (search && search.trim() !== "") {
      where.description = {
        contains: search.trim(),
      };
    }
    if (month && year) {
      const y = parseInt(year, 10);
      const m = parseInt(month, 10);
      where.date = {
        gte: new Date(y, m - 1, 1),
        lte: new Date(y, m, 0, 23, 59, 59, 999),
      };
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        category: true,
        member: true,
        targetMember: true,
      },
      orderBy: { date: "desc" },
      take: limit,
    });

    return NextResponse.json({ transactions });
  } catch (error) {
    console.error("Transactions GET error:", error);
    return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const household = await getActiveHousehold();
    const body = await request.json();

    const {
      type,
      amount,
      categoryId,
      memberId,
      targetMemberId,
      date,
      description,
      incomeType,
      recurringRuleId,
    } = body;

    if (!type || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json({ error: "Invalid type or amount" }, { status: 400 });
    }

    const txDate = date ? new Date(date) : new Date();

    const newTx = await prisma.transaction.create({
      data: {
        householdId: household.id,
        type,
        amount,
        categoryId: categoryId || null,
        memberId: memberId || null,
        targetMemberId: targetMemberId || null,
        date: txDate,
        description: description || "",
        incomeType: incomeType || null,
        recurringRuleId: recurringRuleId || null,
      },
      include: {
        category: true,
        member: true,
        targetMember: true,
      },
    });

    return NextResponse.json({ transaction: newTx }, { status: 201 });
  } catch (error) {
    console.error("Transactions POST error:", error);
    return NextResponse.json({ error: "Failed to create transaction" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const household = await getActiveHousehold();
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json({ error: "Transaction ID required" }, { status: 400 });
    }

    if (data.date) {
      data.date = new Date(data.date);
    }

    const updated = await prisma.transaction.update({
      where: {
        id,
        householdId: household.id,
      },
      data,
      include: {
        category: true,
        member: true,
        targetMember: true,
      },
    });

    return NextResponse.json({ transaction: updated });
  } catch (error) {
    console.error("Transactions PUT error:", error);
    return NextResponse.json({ error: "Failed to update transaction" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const household = await getActiveHousehold();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Transaction ID required" }, { status: 400 });
    }

    // Soft delete
    await prisma.transaction.update({
      where: {
        id,
        householdId: household.id,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Transactions DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete transaction" }, { status: 500 });
  }
}
