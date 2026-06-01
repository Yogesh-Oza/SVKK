import { Prisma } from "@prisma/client";

/**
 * MySQL physical table names (lowercase). Must match prisma `@@map(...)`.
 * Use in $queryRaw / Prisma.sql — Prisma models do not rewrite raw SQL.
 */
export const SQL_TABLE = {
  policy: "policy",
  policyYear: "policyyear",
  member: "member",
  payment: "payment",
  category: "category",
  counter: "counter",
  insuredParty: "insuredparty",
  user: "user",
  permission: "permission",
  claim: "claim",
  policyType: "policytype",
} as const;

/** Safe table identifier for Prisma.sql fragments. */
export function sqlTable(name: keyof typeof SQL_TABLE): Prisma.Sql {
  return Prisma.raw(SQL_TABLE[name]);
}

/** Qualified column (backtick-quoted). Required for camelCase columns in raw MySQL SQL. */
export function sqlCol(alias: string, column: string): Prisma.Sql {
  return Prisma.raw(`${alias}.\`${column}\``);
}
