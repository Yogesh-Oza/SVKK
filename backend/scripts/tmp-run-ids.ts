import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const policyRuns = await p.$queryRawUnsafe<Array<{ migratedRunId: string; cnt: bigint }>>(
  `SELECT migratedRunId, COUNT(*) as cnt FROM policy WHERE migratedRunId IS NOT NULL GROUP BY migratedRunId ORDER BY cnt DESC`
);
const partyRuns = await p.$queryRawUnsafe<Array<{ migratedRunId: string; cnt: bigint }>>(
  `SELECT migratedRunId, COUNT(*) as cnt FROM insuredparty WHERE migratedRunId IS NOT NULL GROUP BY migratedRunId`
);
console.log("Policy runs:", policyRuns);
console.log("Party runs:", partyRuns);
await p.$disconnect();
