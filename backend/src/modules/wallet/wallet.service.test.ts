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
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "txn-1",
      createdAt: new Date(),
      ...data,
    })),
    createMany: vi.fn(async () => ({ count: 0 })),
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
  });

  it("opening sets balance and creates OPENING", async () => {
    const { setOpeningBalance } = await import("./wallet.service.js");
    const result = await setOpeningBalance("5000", "user-1");
    expect(result.currentBalance).toBe("5000.00");
    expect(result.transaction.type).toBe("OPENING");
    expect(txMock.walletTransaction.deleteMany).toHaveBeenCalled();
    expect(txMock.walletTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "OPENING",
          balanceAfter: expect.any(Prisma.Decimal),
        }),
      }),
    );
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
});
