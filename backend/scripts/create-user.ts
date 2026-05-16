/**
 * Create or update a User row (bcrypt password). Run from backend root:
 *
 *   npm run user:create -- --email you@org.com --password "YourPassword" --name "Full Name" --role user
 *
 * Roles: user | supervisor | admin | super-admin (slug)
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { LEGACY_ROLE_SLUGS } from "../src/lib/permission-seed.js";

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const flag = `--${name}`;
  const i = process.argv.indexOf(flag);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

const ROLE_SLUGS = new Set<string>(Object.values(LEGACY_ROLE_SLUGS));

async function main() {
  const email = arg("email");
  const password = arg("password");
  const name = arg("name") ?? (email ? email.split("@")[0] : undefined) ?? "User";
  const roleSlug = (arg("role") ?? LEGACY_ROLE_SLUGS.USER).toLowerCase();

  if (!email || !password) {
    console.error(`
Missing --email or --password.

Usage:
  npm run user:create -- --email you@org.com --password "secret" [--name "Full Name"] [--role user]

Roles: user, supervisor, admin, super-admin
`);
    process.exit(1);
  }

  if (!ROLE_SLUGS.has(roleSlug)) {
    console.error(`Invalid --role "${roleSlug}". Use one of: ${[...ROLE_SLUGS].join(", ")}`);
    process.exit(1);
  }

  const rbacRole = await prisma.rbacRole.findUnique({ where: { slug: roleSlug } });
  if (!rbacRole) {
    console.error(`Role slug "${roleSlug}" not found. Run prisma db seed first.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, name, roleId: rbacRole.id },
    create: { email, passwordHash, name, roleId: rbacRole.id },
  });

  console.log(`OK — user saved: ${email} (${roleSlug})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
