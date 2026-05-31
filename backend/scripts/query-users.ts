import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    take: 5,
    select: { id: true, email: true, role: { select: { slug: true } } },
  });
  console.log(users);
}

main().finally(() => prisma.$disconnect());
