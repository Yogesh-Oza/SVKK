import { Prisma, PrismaClient } from "@prisma/client";
import { sqlTable } from "../src/lib/sql-tables.js";

const prisma = new PrismaClient();

const coll = "utf8mb4_unicode_ci";

function col(table: string, column: string): Prisma.Sql {
  return Prisma.raw(`\`${table}\`.\`${column}\` COLLATE ${coll}`);
}

function param(value: string): Prisma.Sql {
  return Prisma.sql`CAST(${value} AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci`;
}

async function run(name: string, q: Prisma.Sql) {
  try {
    const rows = await prisma.$queryRaw(q);
    console.log("OK", name, Array.isArray(rows) ? rows.length : rows);
  } catch (e) {
    console.error("FAIL", name, (e as Error).message?.slice(0, 120));
  }
}

async function main() {
  const cols = await prisma.$queryRaw<{ Field: string }[]>`
    SHOW COLUMNS FROM ${sqlTable("claim")}
  `;
  console.log("claim columns:", cols.map((c) => c.Field).join(", "));

  const dash = param("—");
  const label = Prisma.sql`COALESCE(${col("c", "village")}, ${col("p", "village")}, ${dash})`;

  await run(
    "simple count",
    Prisma.sql`SELECT COUNT(*) AS n FROM ${sqlTable("claim")} c`,
  );

  await run(
    "join only",
    Prisma.sql`
      SELECT COUNT(*) AS n
      FROM ${sqlTable("claim")} c
      LEFT JOIN ${sqlTable("policy")} p ON c.policyId = p.id AND p.deletedAt IS NULL
    `,
  );

  await run(
    "group by village label",
    Prisma.sql`
      SELECT ${label} AS label, COUNT(*) AS n
      FROM ${sqlTable("claim")} c
      LEFT JOIN ${sqlTable("policy")} p ON c.policyId = p.id AND p.deletedAt IS NULL
      GROUP BY label
    `,
  );

  await run(
    "join + category",
    Prisma.sql`
      SELECT ${label} AS label, COUNT(*) AS n
      FROM ${sqlTable("claim")} c
      LEFT JOIN ${sqlTable("policy")} p ON c.policyId = p.id AND p.deletedAt IS NULL
      LEFT JOIN ${sqlTable("category")} cat ON p.categoryId = cat.id
      GROUP BY label
    `,
  );

  await run(
    "join + policyType count only",
    Prisma.sql`
      SELECT COUNT(*) AS n
      FROM ${sqlTable("claim")} c
      LEFT JOIN ${sqlTable("policy")} p ON c.policyId = p.id AND p.deletedAt IS NULL
      LEFT JOIN ${sqlTable("policyType")} pt ON p.policyTypeId = pt.id
    `,
  );

  await run(
    "join + policyType village group",
    Prisma.sql`
      SELECT ${label} AS label, COUNT(*) AS n
      FROM ${sqlTable("claim")} c
      LEFT JOIN ${sqlTable("policy")} p ON c.policyId = p.id AND p.deletedAt IS NULL
      LEFT JOIN ${sqlTable("policyType")} pt ON p.policyTypeId = pt.id
      GROUP BY label
    `,
  );

  await run(
    "policy_type label group",
    Prisma.sql`
      SELECT COALESCE(${col("pt", "name")}, ${col("c", "policyTypeText")}, ${param("—")}) AS label, COUNT(*) AS n
      FROM ${sqlTable("claim")} c
      LEFT JOIN ${sqlTable("policy")} p ON c.policyId = p.id AND p.deletedAt IS NULL
      LEFT JOIN ${sqlTable("policyType")} pt ON p.policyTypeId = pt.id
      GROUP BY label
    `,
  );

  await run(
    "full claim report shape",
    Prisma.sql`
      SELECT ${label} AS label, COUNT(c.id) AS claimCount
      FROM ${sqlTable("claim")} c
      LEFT JOIN ${sqlTable("policy")} p ON c.policyId = p.id AND p.deletedAt IS NULL
      LEFT JOIN ${sqlTable("policyYear")} py ON c.policyYearId = py.id AND py.deletedAt IS NULL
      LEFT JOIN ${sqlTable("category")} cat ON p.categoryId = cat.id
      LEFT JOIN ${sqlTable("policyType")} pt ON p.policyTypeId = pt.id
      WHERE 1=1
      GROUP BY label
      ORDER BY label ASC
    `,
  );

  await run(
    "enum cast compare",
    Prisma.sql`
      SELECT COUNT(*) AS n
      FROM ${sqlTable("claim")} c
      WHERE CAST(c.matchStatus AS CHAR) COLLATE utf8mb4_unicode_ci = ${param("MATCHED_EXACT")}
    `,
  );
}

main().finally(() => prisma.$disconnect());
