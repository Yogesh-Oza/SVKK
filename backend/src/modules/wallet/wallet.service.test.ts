import { describe, expect, it, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

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
    deleteMany: vi.fn(async () => ({ count: 0 })),
    count: vi.fn(async () => 0),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "txn-1",
      createdAt: new Date(),
      ...data,
    })),
    createMany: vi.fn(async () => ({ count: 0 })),
  },
  policy: {
    findMany: vi.fn(async () => []),
  },
  $executeRaw: vi.fn(async () => 1),
};

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
    wallet: {
      upsert: vi.fn(async () => walletState),
    },
    walletTransaction: {
      aggregate: vi.fn(),
      groupBy: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe("wallet.service ledger math", () => {
  beforeEach(() => {
    walletState.currentBalance = new Prisma.Decimal(1000);
    vi.clearAllMocks();
    txMock.walletTransaction.count.mockResolvedValue(0);
  });

  it("opening sets balance and creates OPENING without wiping when empty", async () => {
    const { setOpeningBalance } = await import("./wallet.service.js");
    const result = await setOpeningBalance("5000", "user-1");
    expect(result.currentBalance).toBe("5000.00");
    expect(result.transaction.type).toBe("OPENING");
    expect(txMock.walletTransaction.deleteMany).not.toHaveBeenCalled();
    expect(txMock.walletTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "OPENING",
          balanceAfter: expect.any(Prisma.Decimal),
        }),
      }),
    );
  });

  it("opening refuses when history exists", async () => {
    txMock.walletTransaction.count.mockResolvedValue(3);
    const { setOpeningBalance } = await import("./wallet.service.js");
    await expect(setOpeningBalance("5000", "user-1")).rejects.toMatchObject({
      code: "WALLET_OPENING_EXISTS",
      statusCode: 409,
    });
  });

  it("top-up adds to balance", async () => {
    const { topUpWallet } = await import("./wallet.service.js");
    const result = await topUpWallet("250", "UPI", "user-1");
    expect(result.currentBalance).toBe("1250.00");
    expect(result.transaction.type).toBe("TOP-UP");
  });

  it("manual debit without allowNegative returns WALLET_INSUFFICIENT", async () => {
    const { manualDebit } = await import("./wallet.service.js");
    const { AppError } = await import("../../errors/app-error.js");
    await expect(
      manualDebit({ category: "A", amount: "2000", allowNegative: false }),
    ).rejects.toMatchObject({ code: "WALLET_INSUFFICIENT", statusCode: 409 } satisfies Partial<
      InstanceType<typeof AppError>
    >);
  });

  it("manual debit with allowNegative can go negative", async () => {
    const { manualDebit } = await import("./wallet.service.js");
    const result = await manualDebit({
      category: "A",
      amount: "1500",
      allowNegative: true,
    });
    expect(result.currentBalance).toBe("-500.00");
    expect(result.transaction.type).toBe("DEBIT");
  });

  it("manual debit decreases balance", async () => {
    const { manualDebit } = await import("./wallet.service.js");
    const result = await manualDebit({ category: "Staff", amount: "100" });
    expect(result.currentBalance).toBe("900.00");
  });

  it("creditWallet increases balance", async () => {
    const { creditWallet } = await import("./wallet.service.js");
    const result = await creditWallet({ amount: "200", remark: "Refund", userId: "u1" });
    expect(result.currentBalance).toBe("1200.00");
    expect(result.transaction.type).toBe("CREDIT");
  });

  it("adjustWallet debit decreases balance", async () => {
    const { adjustWallet } = await import("./wallet.service.js");
    const result = await adjustWallet({
      amount: "50",
      direction: "DEBIT",
      remark: "Correction",
      allowNegative: false,
    });
    expect(result.currentBalance).toBe("950.00");
    expect(result.transaction.type).toBe("ADJUSTMENT");
  });

  it("restoreWalletFromBackup clears then replays oldest-first", async () => {
    const { restoreWalletFromBackup } = await import("./wallet.service.js");
    const result = await restoreWalletFromBackup(
      true,
      {
        wallet_balance: "850",
        wallet_last_updated: "2026-01-01",
        wallet_transactions: [
          { type: "DEBIT", amount: "200", date: "2026-01-02", category: "A" },
          { type: "OPENING", amount: "1000", date: "2026-01-01" },
          { type: "CREDIT", amount: "50", date: "2026-01-03", remark: "Refund" },
        ],
      },
      "user-1",
    );
    expect(result.restoredCount).toBe(3);
    expect(result.currentBalance).toBe("850.00");
    expect(txMock.walletTransaction.deleteMany).toHaveBeenCalled();
    expect(txMock.walletTransaction.create).toHaveBeenCalledTimes(3);
    const types = txMock.walletTransaction.create.mock.calls.map(
      (c) => (c[0] as { data: { type: string; source: string } }).data.type,
    );
    expect(types).toEqual(["OPENING", "DEBIT", "CREDIT"]);
    expect(
      (txMock.walletTransaction.create.mock.calls[0]![0] as { data: { source: string } }).data
        .source,
    ).toBe("RESTORE");
  });

  it("restoreWalletFromBackup rejects invalid backup before clearing", async () => {
    const { restoreWalletFromBackup } = await import("./wallet.service.js");
    await expect(
      restoreWalletFromBackup(
        true,
        { wallet_transactions: [{ type: "NOPE", amount: "10" }] },
        "user-1",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(txMock.walletTransaction.deleteMany).not.toHaveBeenCalled();
  });
});
