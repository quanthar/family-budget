import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getActiveHousehold } from "@/lib/db/household";

export async function GET() {
  try {
    const household = await getActiveHousehold();
    const categories = await prisma.category.findMany({
      where: {
        householdId: household.id,
        isArchived: false,
      },
      orderBy: { order: "asc" },
    });
    return NextResponse.json({ categories });
  } catch (error) {
    console.error("Categories GET error:", error);
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const household = await getActiveHousehold();
    const body = await request.json();
    const { name, icon = "MoreHorizontal", color = "#71717a" } = body;

    if (!name || name.trim() === "") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const count = await prisma.category.count({ where: { householdId: household.id } });

    const newCategory = await prisma.category.create({
      data: {
        householdId: household.id,
        name: name.trim(),
        icon,
        color,
        order: count,
      },
    });

    return NextResponse.json({ category: newCategory }, { status: 201 });
  } catch (error) {
    console.error("Categories POST error:", error);
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const household = await getActiveHousehold();
    const body = await request.json();
    const { id, name, icon, color, order } = body;

    if (!id) {
      return NextResponse.json({ error: "Category ID required" }, { status: 400 });
    }

    const updated = await prisma.category.update({
      where: {
        id,
        householdId: household.id,
      },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(icon ? { icon } : {}),
        ...(color ? { color } : {}),
        ...(order !== undefined ? { order } : {}),
      },
    });

    return NextResponse.json({ category: updated });
  } catch (error) {
    console.error("Categories PUT error:", error);
    return NextResponse.json({ error: "Failed to update category" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const household = await getActiveHousehold();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Category ID required" }, { status: 400 });
    }

    // Soft delete / archive
    await prisma.category.update({
      where: {
        id,
        householdId: household.id,
      },
      data: {
        isArchived: true,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Categories DELETE error:", error);
    return NextResponse.json({ error: "Failed to archive category" }, { status: 500 });
  }
}
