/**
 * Create or update a User row (bcrypt password). Run from backend root:
 *
 *   npm run user:create -- --email you@org.com --password "YourPassword" --name "Full Name" --role USER
 *
 * Roles: USER | SUPERVISOR | ADMIN | SUPER_ADMIN
 */
import "dotenv/config";
import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const flag = `--${name}`;
  const i = process.argv.indexOf(flag);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

const ROLES = new Set<string>(Object.values(UserRole));

async function main() {
  const email = arg("email");
  const password = arg("password");
  const name = arg("name") ?? (email ? email.split("@")[0] : undefined) ?? "User";
  const roleRaw = (arg("role") ?? "USER").toUpperCase();

  if (!email || !password) {
    console.error(`
Missing --email or --password.

Usage:
  npm run user:create -- --email you@org.com --password "secret" [--name "Full Name"] [--role USER]

Roles: USER, SUPERVISOR, ADMIN, SUPER_ADMIN
`);
    process.exit(1);
  }

  if (!ROLES.has(roleRaw)) {
    console.error(`Invalid --role "${roleRaw}". Use one of: ${[...ROLES].join(", ")}`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const role = roleRaw as UserRole;

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, name, role },
    create: { email, passwordHash, name, role },
  });

  console.log(`OK — user saved: ${email} (${role})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
