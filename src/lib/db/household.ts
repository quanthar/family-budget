import { prisma } from "./prisma";

/**
 * Returns the default active household for local development.
 * Automatically creates one with default categories if empty.
 */
export async function getActiveHousehold() {
  let household = await prisma.household.findFirst({
    include: {
      members: {
        include: {
          salarySettings: {
            where: { isActive: true },
          },
        },
      },
    },
  });

  if (!household) {
    // If somehow DB was cleared, create a default household
    household = await prisma.household.create({
      data: {
        name: "Наша семья",
        currency: "RUB",
        members: {
          create: [
            { name: "Алексей", order: 0 },
            { name: "Мария", order: 1 },
          ],
        },
      },
      include: {
        members: {
          include: {
            salarySettings: {
              where: { isActive: true },
            },
          },
        },
      },
    });
  }

  return household;
}
