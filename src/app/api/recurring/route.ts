import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getActiveHousehold } from "@/lib/db/household";

export async function GET() {
  try {
    const household = await getActiveHousehold();
    const rules = await prisma.recurringRule.findMany({
      where: {
        householdId: household.id,
      },
      include: {
        category: true,
      },
      orderBy: { dayOfMonth: "asc" },
    });
    return NextResponse.json({ rules });
  } catch (error) {
    console.error("Recurring GET error:", error);
    return NextResponse.json({ error: "Failed to fetch recurring rules" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const household = await getActiveHousehold();
    const body = await request.json();
    const {
      name,
      type = "expense",
      amount,
      categoryId,
      memberId,
      owner = "shared",
      period = "monthly",
      dayOfMonth = 1,
    } = body;

    if (!name || typeof amount !== "number" || amount <= 0 || !categoryId) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }

    const newRule = await prisma.recurringRule.create({
      data: {
        householdId: household.id,
        name: name.trim(),
        type,
        amount,
        categoryId,
        memberId: memberId || null,
        owner,
        period,
        dayOfMonth: Math.min(31, Math.max(1, dayOfMonth)),
        isActive: true,
      },
      include: {
        category: true,
      },
    });

    return NextResponse.json({ rule: newRule }, { status: 201 });
  } catch (error) {
    console.error("Recurring POST error:", error);
    return NextResponse.json({ error: "Failed to create recurring rule" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const household = await getActiveHousehold();
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json({ error: "Rule ID required" }, { status: 400 });
    }

    const updated = await prisma.recurringRule.update({
      where: { id },
      data,
      include: {
        category: true,
      },
    });

    return NextResponse.json({ rule: updated });
  } catch (error) {
    console.error("Recurring PUT error:", error);
    return NextResponse.json({ error: "Failed to update recurring rule" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const household = await getActiveHousehold();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Rule ID required" }, { status: 400 });
    }

    await prisma.recurringRule.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Recurring DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete recurring rule" }, { status: 500 });
  }
}
