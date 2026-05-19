#!/usr/bin/env node
/**
 * Transfer all rows from a local MySQL source database into a target MySQL database.
 *
 * Usage:
 *   npm run db:transfer-local -- --source "mysql://root:root@localhost:3306/railway" \
 *     --target "mysql://vagadevents_root:password@86.107.77.144:3306/vagadevents_svkkdb" \
 *     --truncate
 *
 * Environment variables:
 *   SOURCE_DATABASE_URL=...
 *   TARGET_DATABASE_URL=...
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import type { Pool, RowDataPacket, FieldPacket } from "mysql2/promise";

function argValue(name: string): string | undefined {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function escapeIdentifier(name: string): string {
  return `\`${name.replace(/`/g, "``")}\``;
}

async function getTables(pool: Pool, schema: string): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE' ORDER BY table_name",
    [schema],
  );
  return rows.map((row) => String((row as any).name ?? "")).filter((name) => name !== "");
}

async function fetchRows(pool: Pool, table: string): Promise<{ rows: RowDataPacket[]; fields: FieldPacket[] }> {
  const [rows, fields] = (await pool.query<RowDataPacket[]>(`SELECT * FROM ${escapeIdentifier(table)}`)) as [RowDataPacket[], FieldPacket[]];
  return { rows, fields };
}

async function truncateTables(pool: Pool, tables: string[]) {
  for (const table of tables) {
    console.log(`Truncating target table ${table}`);
    await pool.query(`TRUNCATE TABLE ${escapeIdentifier(table)}`);
  }
}

function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Date) return value;
    return JSON.stringify(value);
  }
  return value;
}

async function insertRows(pool: Pool, table: string, rows: RowDataPacket[], fields: FieldPacket[]) {
  if (rows.length === 0) {
    return;
  }

  const columns = fields.map((field) => field.name as string);
  const columnList = columns.map(escapeIdentifier).join(", ");
  const allValues = rows.map((row) =>
    columns.map((column) => normalizeValue(row[column])),
  );
  const batchSize = 100;

  for (let start = 0; start < allValues.length; start += batchSize) {
    const batch = allValues.slice(start, start + batchSize);
    const placeholders = batch.map(() => `(${columns.map(() => "?").join(",")})`).join(",");
    const sql = `INSERT INTO ${escapeIdentifier(table)} (${columnList}) VALUES ${placeholders}`;
    await pool.query(sql, batch.flat());
  }
}

function getDatabaseName(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return url.pathname.replace(/^\//, "");
}

async function getRowCount(pool: Pool, table: string): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS cnt FROM ${escapeIdentifier(table)}`);
  return Number(rows[0]?.cnt ?? 0);
}

async function main() {
  const sourceUrl = argValue("source") ?? process.env.SOURCE_DATABASE_URL?.trim();
  const targetUrl = argValue("target") ?? process.env.TARGET_DATABASE_URL?.trim() ?? process.env.DATABASE_URL?.trim();
  const truncate = process.argv.includes("--truncate");
  const dryRun = process.argv.includes("--dry-run");

  if (!sourceUrl || !targetUrl) {
    console.error(`Missing source or target connection string.\n\nUsage:\n  npm run db:transfer-local -- --source "mysql://root:root@localhost:3306/railway" --target "mysql://user:pass@host:3306/dbname" [--truncate] [--dry-run]`);
    process.exit(1);
  }

  const sourceSchema = getDatabaseName(sourceUrl);
  const targetSchema = getDatabaseName(targetUrl);

  console.log(`Source database: ${sourceSchema}`);
  console.log(`Target database: ${targetSchema}`);
  if (dryRun) {
    console.log("Dry run enabled: no data will be modified in the target database.");
  }
  console.log(truncate && !dryRun ? "Target tables will be truncated before insert." : "Target rows will be appended to existing data.");

  const sourcePool = mysql.createPool({
    uri: sourceUrl,
    waitForConnections: true,
    connectionLimit: 4,
    enableKeepAlive: true,
  });
  const targetPool = mysql.createPool({
    uri: targetUrl,
    waitForConnections: true,
    connectionLimit: 4,
    enableKeepAlive: true,
  });

  try {
    const sourceTables = await getTables(sourcePool, sourceSchema);
    if (sourceTables.length === 0) {
      console.warn("No tables found in source database.");
      return;
    }

    const targetTables = await getTables(targetPool, targetSchema);
    const targetTableMap = new Map<string, string>(
      targetTables.map((name) => [name.toLowerCase(), name]),
    );

    if (!dryRun) {
      await targetPool.query("SET FOREIGN_KEY_CHECKS = 0");
      if (truncate) {
        const targetTableNames = sourceTables
          .map((table) => targetTableMap.get(table.toLowerCase()))
          .filter((name): name is string => Boolean(name));
        await truncateTables(targetPool, targetTableNames);
      }
    }

    for (const sourceTable of sourceTables) {
      const targetTable = targetTableMap.get(sourceTable.toLowerCase());
      if (!targetTable) {
        console.warn(`Skipping ${sourceTable}: no matching target table found.`);
        continue;
      }

      const { rows, fields } = await fetchRows(sourcePool, sourceTable);
      if (rows.length === 0) {
        console.log(`Skipping ${sourceTable}: no rows found in source.`);
        continue;
      }

      if (dryRun) {
        const targetCount = await getRowCount(targetPool, targetTable).catch(() => -1);
        console.log(`Dry run: ${sourceTable} -> ${targetTable} source rows=${rows.length}, target rows=${targetCount >= 0 ? targetCount : "unknown"}`);
        continue;
      }

      console.log(`Transferring table ${sourceTable} -> ${targetTable}`);
      await insertRows(targetPool, targetTable, rows, fields);
      console.log(`  Inserted ${rows.length} rows into ${targetTable}.`);
    }

    if (!dryRun) {
      await targetPool.query("SET FOREIGN_KEY_CHECKS = 1");
      console.log("Transfer complete.");
    } else {
      console.log("Dry run complete. No data was modified.");
    }
  } catch (error) {
    console.error("Transfer failed:", error);
    process.exit(1);
  } finally {
    await sourcePool.end();
    await targetPool.end();
  }
}

main();
