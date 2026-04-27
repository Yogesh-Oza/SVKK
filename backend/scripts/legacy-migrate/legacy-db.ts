import mysql from "mysql2/promise";
import type { LegacyMemberRow, LegacyPolicyRow } from "./types.js";

export function createLegacyPool(legacyUrl: string) {
  return mysql.createPool({
    uri: legacyUrl,
    waitForConnections: true,
    connectionLimit: 4,
    dateStrings: true,
    enableKeepAlive: true,
  });
}

export async function countPolicyRows(pool: mysql.Pool): Promise<number> {
  const [rows] = await pool.query<[{ cnt: bigint }]>(
    "SELECT COUNT(*) AS cnt FROM policy_table",
  );
  return Number(rows[0]?.cnt ?? 0);
}

export async function countOrphanMembers(pool: mysql.Pool): Promise<number> {
  const [rows] = await pool.query<[{ cnt: bigint }]>(
    `SELECT COUNT(*) AS cnt FROM member m
     LEFT JOIN policy_table p ON m.ref_no = p.ref_no
     WHERE m.ref_no IS NOT NULL AND m.ref_no != '' AND p.ref_no IS NULL`,
  );
  return Number(rows[0]?.cnt ?? 0);
}

export async function fetchPolicyChunkKeyset(
  pool: mysql.Pool,
  afterRefNo: string | null,
  limit: number,
): Promise<LegacyPolicyRow[]> {
  if (afterRefNo == null) {
    const [rows] = await pool.query<LegacyPolicyRow[]>(
      "SELECT * FROM policy_table ORDER BY ref_no ASC LIMIT ?",
      [limit],
    );
    return rows;
  }
  const [rows] = await pool.query<LegacyPolicyRow[]>(
    "SELECT * FROM policy_table WHERE ref_no > ? ORDER BY ref_no ASC LIMIT ?",
    [afterRefNo, limit],
  );
  return rows;
}

export async function fetchMembersForRefNos(
  pool: mysql.Pool,
  refNos: string[],
): Promise<LegacyMemberRow[]> {
  if (refNos.length === 0) return [];
  const placeholders = refNos.map(() => "?").join(",");
  const [rows] = await pool.query<LegacyMemberRow[]>(
    `SELECT * FROM member WHERE ref_no IN (${placeholders})`,
    refNos,
  );
  return rows;
}
