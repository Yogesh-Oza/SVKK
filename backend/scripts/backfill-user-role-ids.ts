/**
 * Assigns User.roleId from email patterns when legacy role column is gone.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { LEGACY_ROLE_SLUGS } from "../src/lib/permission-seed.js";

const prisma = new PrismaClient();

const EMAIL_SLUG: Record<string, string> = {
  "admin@svkk.local": LEGACY_ROLE_SLUGS.SUPER_ADMIN,
  "supervisor@svkk.local": LEGACY_ROLE_SLUGS.SUPERVISOR,
  "user@svkk.local": LEGACY_ROLE_SLUGS.USER,
};

async function main() {
  const roles = await prisma.rbacRole.findMany({ select: { id: true, slug: true } });
  const slugToId = new Map(roles.map((r) => [r.slug, r.id]));
  const defaultRoleId = slugToId.get(LEGACY_ROLE_SLUGS.USER)!;

  const users = await prisma.user.findMany({ select: { id: true, email: true, roleId: true } });
  for (const u of users) {
    if (u.roleId) continue;
    const slug = EMAIL_SLUG[u.email.toLowerCase()] ?? LEGACY_ROLE_SLUGS.USER;
    const roleId = slugToId.get(slug) ?? defaultRoleId;
    await prisma.user.update({ where: { id: u.id }, data: { roleId } });
    console.log(`${u.email} → ${slug}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
