import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getActiveHousehold } from "@/lib/db/household";

export async function GET() {
  try {
    const household = await getActiveHousehold();
    const members = await prisma.householdMember.findMany({
      where: { householdId: household.id },
      include: {
        salarySettings: {
          where: { isActive: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { order: "asc" },
    });

    return NextResponse.json({ members });
  } catch (error) {
    console.error("Members GET error:", error);
    return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const household = await getActiveHousehold();
    const body = await request.json();
    const { id, name, salarySettings } = body;

    if (!id) {
      return NextResponse.json({ error: "Member ID required" }, { status: 400 });
    }

    if (name) {
      await prisma.householdMember.update({
        where: { id },
        data: { name: name.trim() },
      });
    }

    if (salarySettings) {
      const {
        monthlySalary,
        salaryType = "net",
        payDates = [25, 10],
        payProportions = [0.4, 0.6],
        transferRule = "previous_working_day",
      } = salarySettings;

      // Upsert salary setting
      const existing = await prisma.salarySettings.findFirst({
        where: { memberId: id, isActive: true },
      });

      if (existing) {
        await prisma.salarySettings.update({
          where: { id: existing.id },
          data: {
            monthlySalary,
            salaryType,
            payDates: JSON.stringify(payDates),
            payProportions: JSON.stringify(payProportions),
            transferRule,
          },
        });
      } else {
        await prisma.salarySettings.create({
          data: {
            memberId: id,
            monthlySalary,
            salaryType,
            payDates: JSON.stringify(payDates),
            payProportions: JSON.stringify(payProportions),
            transferRule,
          },
        });
      }
    }

    const updated = await prisma.householdMember.findUnique({
      where: { id },
      include: {
        salarySettings: {
          where: { isActive: true },
        },
      },
    });

    return NextResponse.json({ member: updated });
  } catch (error) {
    console.error("Members PUT error:", error);
    return NextResponse.json({ error: "Failed to update member" }, { status: 500 });
  }
}
