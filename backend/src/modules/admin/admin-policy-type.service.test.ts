import { describe, expect, it, vi, beforeEach } from "vitest";
import { AppError } from "../../errors/app-error.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    policyType: { findUnique: vi.fn(), delete: vi.fn() },
    policy: { count: vi.fn() },
    policyYear: { count: vi.fn() },
    policyChart: { findMany: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<void>) =>
      fn({
        policyChart: { deleteMany: vi.fn() },
        policyType: { delete: vi.fn() },
      }),
    ),
  },
}));

vi.mock("../premium/chart-cache.js", () => ({
  invalidateChartCache: vi.fn(),
}));

import { prisma } from "../../lib/prisma.js";
import { deletePolicyType } from "./admin-policy-type.service.js";

describe("deletePolicyType", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 409 when active policies reference the type", async () => {
    vi.mocked(prisma.policyType.findUnique).mockResolvedValue({
      id: "pt1",
      name: "AD Policy",
    } as never);
    vi.mocked(prisma.policy.count).mockResolvedValue(3);
    vi.mocked(prisma.policyYear.count).mockResolvedValue(3);

    await expect(deletePolicyType("pt1")).rejects.toMatchObject({
      code: "CONFLICT",
      statusCode: 409,
    } satisfies Partial<AppError>);
    expect(prisma.policyType.delete).not.toHaveBeenCalled();
  });

  it("deletes charts then type when nothing references it", async () => {
    vi.mocked(prisma.policyType.findUnique).mockResolvedValue({
      id: "pt1",
      name: "Test Type",
    } as never);
    vi.mocked(prisma.policy.count).mockResolvedValue(0);
    vi.mocked(prisma.policyYear.count).mockResolvedValue(0);
    vi.mocked(prisma.policyChart.findMany).mockResolvedValue([{ id: "chart1" }] as never);

    await deletePolicyType("pt1");

    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
