import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const DEFAULT_CATEGORIES = [
  { name: "Жилье", icon: "Home", color: "#6366f1", order: 0 },
  { name: "Продукты", icon: "ShoppingCart", color: "#22c55e", order: 1 },
  { name: "Транспорт", icon: "Car", color: "#3b82f6", order: 2 },
  { name: "Здоровье", icon: "Heart", color: "#ef4444", order: 3 },
  { name: "Красота", icon: "Sparkles", color: "#ec4899", order: 4 },
  { name: "Развлечения", icon: "Gamepad2", color: "#f59e0b", order: 5 },
  { name: "Одежда", icon: "Shirt", color: "#8b5cf6", order: 6 },
  { name: "Дети", icon: "Baby", color: "#14b8a6", order: 7 },
  { name: "Дом", icon: "Wrench", color: "#78716c", order: 8 },
  { name: "Подписки", icon: "CreditCard", color: "#a78bfa", order: 9 },
  { name: "Связь", icon: "Smartphone", color: "#06b6d4", order: 10 },
  { name: "Путешествия", icon: "Plane", color: "#f97316", order: 11 },
  { name: "Подарки", icon: "Gift", color: "#e879f9", order: 12 },
  { name: "Кредиты", icon: "Landmark", color: "#dc2626", order: 13 },
  { name: "Другое", icon: "MoreHorizontal", color: "#71717a", order: 14 },
];

async function main() {
  console.log("Seeding database...");

  // Create demo user
  const passwordHash = await hash("demo1234", 12);
  const user = await prisma.user.upsert({
    where: { email: "demo@family.budget" },
    update: {},
    create: {
      email: "demo@family.budget",
      passwordHash,
      name: "Demo User",
    },
  });

  // Create household
  const household = await prisma.household.create({
    data: {
      name: "Наша семья",
      currency: "RUB",
      users: {
        create: {
          userId: user.id,
          role: "owner",
        },
      },
    },
  });

  // Create members
  const member1 = await prisma.householdMember.create({
    data: {
      householdId: household.id,
      userId: user.id,
      name: "Алексей",
      order: 0,
    },
  });

  const member2 = await prisma.householdMember.create({
    data: {
      householdId: household.id,
      name: "Мария",
      order: 1,
    },
  });

  // Create salary settings
  await prisma.salarySettings.create({
    data: {
      memberId: member1.id,
      monthlySalary: 210000,
      salaryType: "net",
      payDates: JSON.stringify([10, 25]),
      payProportions: JSON.stringify([0.6, 0.4]),
      transferRule: "previous_working_day",
    },
  });

  await prisma.salarySettings.create({
    data: {
      memberId: member2.id,
      monthlySalary: 110000,
      salaryType: "net",
      payDates: JSON.stringify([5, 20]),
      payProportions: JSON.stringify([0.6, 0.4]),
      transferRule: "previous_working_day",
    },
  });

  // Create default categories
  for (const cat of DEFAULT_CATEGORIES) {
    await prisma.category.create({
      data: {
        householdId: household.id,
        name: cat.name,
        icon: cat.icon,
        color: cat.color,
        order: cat.order,
        isDefault: true,
      },
    });
  }

  // Get category IDs for demo transactions
  const categories = await prisma.category.findMany({
    where: { householdId: household.id },
  });

  const catMap = Object.fromEntries(categories.map((c) => [c.name, c.id]));

  // Create recurring rules
  await prisma.recurringRule.create({
    data: {
      householdId: household.id,
      name: "Аренда",
      type: "expense",
      amount: 50000,
      categoryId: catMap["Жилье"],
      owner: "shared",
      period: "monthly",
      dayOfMonth: 5,
    },
  });

  await prisma.recurringRule.create({
    data: {
      householdId: household.id,
      name: "Ипотека",
      type: "expense",
      amount: 80000,
      categoryId: catMap["Жилье"],
      owner: "shared",
      period: "monthly",
      dayOfMonth: 15,
    },
  });

  await prisma.recurringRule.create({
    data: {
      householdId: household.id,
      name: "Интернет",
      type: "expense",
      amount: 900,
      categoryId: catMap["Связь"],
      owner: "shared",
      period: "monthly",
      dayOfMonth: 20,
    },
  });

  await prisma.recurringRule.create({
    data: {
      householdId: household.id,
      name: "Подписки",
      type: "expense",
      amount: 1500,
      categoryId: catMap["Подписки"],
      owner: "shared",
      period: "monthly",
      dayOfMonth: 22,
    },
  });

  // Create demo transactions for current month
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const demoTransactions = [
    // Incomes
    {
      type: "income",
      amount: 126000,
      memberId: member1.id,
      date: new Date(year, month, 10),
      description: "Зарплата",
      incomeType: "salary",
    },
    {
      type: "income",
      amount: 84000,
      memberId: member1.id,
      date: new Date(year, month, 25),
      description: "Зарплата (аванс)",
      incomeType: "salary",
    },
    {
      type: "income",
      amount: 66000,
      memberId: member2.id,
      date: new Date(year, month, 5),
      description: "Зарплата",
      incomeType: "salary",
    },
    {
      type: "income",
      amount: 44000,
      memberId: member2.id,
      date: new Date(year, month, 20),
      description: "Зарплата (аванс)",
      incomeType: "salary",
    },
    // Expenses
    {
      type: "expense",
      amount: 50000,
      categoryId: catMap["Жилье"],
      memberId: member1.id,
      date: new Date(year, month, 5),
      description: "Аренда",
    },
    {
      type: "expense",
      amount: 4850,
      categoryId: catMap["Продукты"],
      memberId: member1.id,
      date: new Date(year, month, 14),
      description: "Пятерочка",
    },
    {
      type: "expense",
      amount: 8200,
      categoryId: catMap["Продукты"],
      memberId: member2.id,
      date: new Date(year, month, 12),
      description: "Перекресток",
    },
    {
      type: "expense",
      amount: 18150,
      categoryId: catMap["Продукты"],
      memberId: member1.id,
      date: new Date(year, month, 8),
      description: "ВкусВилл",
    },
    {
      type: "expense",
      amount: 2300,
      categoryId: catMap["Транспорт"],
      memberId: member1.id,
      date: new Date(year, month, 10),
      description: "Метро",
    },
    {
      type: "expense",
      amount: 6600,
      categoryId: catMap["Транспорт"],
      memberId: member2.id,
      date: new Date(year, month, 11),
      description: "Такси",
    },
    {
      type: "expense",
      amount: 999,
      categoryId: catMap["Подписки"],
      memberId: member1.id,
      date: new Date(year, month, 7),
      description: "Netflix",
    },
    {
      type: "expense",
      amount: 3200,
      categoryId: catMap["Подписки"],
      memberId: member1.id,
      date: new Date(year, month, 7),
      description: "Яндекс Плюс",
    },
    {
      type: "expense",
      amount: 5400,
      categoryId: catMap["Развлечения"],
      memberId: member2.id,
      date: new Date(year, month, 13),
      description: "Кино",
    },
    {
      type: "expense",
      amount: 12000,
      categoryId: catMap["Одежда"],
      memberId: member2.id,
      date: new Date(year, month, 9),
      description: "Zara",
    },
    {
      type: "expense",
      amount: 3500,
      categoryId: catMap["Здоровье"],
      memberId: member1.id,
      date: new Date(year, month, 6),
      description: "Аптека",
    },
  ];

  for (const t of demoTransactions) {
    await prisma.transaction.create({
      data: {
        householdId: household.id,
        type: t.type,
        amount: t.amount,
        categoryId: t.categoryId || null,
        memberId: t.memberId,
        date: t.date,
        description: t.description,
        incomeType: t.incomeType || null,
      },
    });
  }

  // Create budget period
  await prisma.budgetPeriod.create({
    data: {
      householdId: household.id,
      year,
      month: month + 1,
      status: "active",
    },
  });

  console.log("Seed complete!");
  console.log(`  User: demo@family.budget / demo1234`);
  console.log(`  Household: ${household.name}`);
  console.log(`  Members: ${member1.name}, ${member2.name}`);
  console.log(`  Categories: ${categories.length}`);
  console.log(`  Transactions: ${demoTransactions.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
