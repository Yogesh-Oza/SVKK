import { describe, expect, it, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { buildWalletSampleCsv } from "./wallet-csv-format.js";
import { importWalletUsageCsv } from "./wallet-csv-import.js";

const walletState = {
  id: "wallet-1",
  currentBalance: new Prisma.Decimal(1000),
  lastUpdatedAt: new Date("2026-01-01"),
};

const txMock = {
  wallet: {
    upsert: vi.fn(async () => walletState),
    findUniqueOrThrow: vi.fn(async () => ({ ...walletState })),
    update: vi.fn(async ({ data }: { data: { currentBalance: Prisma.Decimal } }) => {
      walletState.currentBalance = data.currentBalance;
      return walletState;
    }),
  },
  walletTransaction: {
    createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
  },
  $executeRaw: vi.fn(async () => 1),
};

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
  },
}));

describe("wallet CSV import", () => {
  beforeEach(() => {
    walletState.currentBalance = new Prisma.Decimal(1000);
    vi.clearAllMocks();
  });

  it("imports sample CSV with debit and credit rows", async () => {
    const buf = Buffer.from(buildWalletSampleCsv(), "utf8");
    const result = await importWalletUsageCsv(buf, "user-1");
    expect(result.rowsDeducted).toBe(3);
    expect(result.rowsCredited).toBe(1);
    expect(result.skippedRows).toBe(0);
    expect(result.invalidCategoryRows).toBe(0);
    expect(result.totalDeducted).toBe("470.00");
    expect(result.totalDeposited).toBe("500.00");
    expect(result.remainingBalance).toBe("1030.00");
    expect(txMock.walletTransaction.createMany).toHaveBeenCalled();
    const created = txMock.walletTransaction.createMany.mock.calls[0]![0].data as {
      type: string;
      balanceAfter: Prisma.Decimal;
      amount: Prisma.Decimal;
    }[];
    expect(created).toHaveLength(4);
    let bal = new Prisma.Decimal(1000);
    for (const row of created) {
      bal = row.type === "CREDIT" ? bal.plus(row.amount) : bal.minus(row.amount);
      expect(row.balanceAfter.toString()).toBe(bal.toString());
    }
  });

  it("keeps backward compatible Date/Particulars/Amount headers", async () => {
    const csv =
      "Date,Category,Particulars,Amount,Reference\n" +
      "2026-06-16,A,Ok,100,R1\n" +
      "2026-06-16,,Missing cat,50,R2\n" +
      "2026-06-16,B,Zero,0,R3\n" +
      "2026-06-16,C,Neg,-5,R4\n";
    const result = await importWalletUsageCsv(Buffer.from(csv, "utf8"), undefined);
    expect(result.rowsDeducted).toBe(1);
    expect(result.rowsCredited).toBe(0);
    expect(result.invalidCategoryRows).toBe(1);
    expect(result.skippedRows).toBe(3);
    expect(result.totalDeducted).toBe("100.00");
    expect(result.remainingBalance).toBe("900.00");
  });

  it("imports prototype Credit/Debit columns", async () => {
    const csv =
      "Date of Submission,Month,Year,Type,Holder's Name,Village,Category,Group,Policy Type,CD Account Used,CD Amount,Remark,Deposited/Deducted Amount\n" +
      "2026-06-16,June,2026,Debit,Kiran,Bhachau,A,SVKK,Individual,CD-1023,5000,Printing,250\n" +
      "2026-06-16,June,2026,Credit,-,-,SVGA,-,-,-,-,Donation,500\n";
    const result = await importWalletUsageCsv(Buffer.from(csv, "utf8"), "user-1");
    expect(result.rowsDeducted).toBe(1);
    expect(result.rowsCredited).toBe(1);
    expect(result.totalDeducted).toBe("250.00");
    expect(result.totalDeposited).toBe("500.00");
    expect(result.remainingBalance).toBe("1250.00");
    const created = txMock.walletTransaction.createMany.mock.calls[0]![0].data as {
      type: string;
      holderName: string | null;
      village: string | null;
      monthText: string | null;
    }[];
    expect(created[0]?.type).toBe("DEBIT");
    expect(created[0]?.holderName).toBe("Kiran");
    expect(created[0]?.village).toBe("Bhachau");
    expect(created[0]?.monthText).toBe("June");
    expect(created[1]?.type).toBe("CREDIT");
  });

  it("rejects missing headers", async () => {
    await expect(
      importWalletUsageCsv(Buffer.from("Foo,Bar\n1,2\n", "utf8"), undefined),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
