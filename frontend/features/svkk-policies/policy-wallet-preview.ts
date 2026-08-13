import type { SvkkPolicyDetailForForm } from "./ad-policy-detail-to-form";

function parseMoneyField(raw: string): number | null {
  const n = Number(String(raw ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

/** Matches backend `effectiveCdAmount`: YES + positive amount only. */
export function effectiveCdFromForm(cdAccountStatus: string, cdAmount: string): number {
  if (cdAccountStatus !== "YES") return 0;
  const n = parseMoneyField(cdAmount);
  if (n == null || n <= 0) return 0;
  return n;
}

export function savedCdFieldsFromPolicy(
  detail: SvkkPolicyDetailForForm | null | undefined,
): { cdAccountStatus: string; cdAmount: string } {
  if (!detail) {
    return { cdAccountStatus: "", cdAmount: "" };
  }
  return {
    cdAccountStatus:
      detail.cdAccountUsed === true ? "YES" : detail.cdAccountUsed === false ? "NO" : "",
    cdAmount: detail.cdAmount != null ? String(detail.cdAmount) : "",
  };
}

export type WalletCdPreview = {
  currentBalance: number | null;
  savedEffectiveCd: number;
  newEffectiveCd: number;
  cdDelta: number;
  projectedBalance: number | null;
  wouldGoNegative: boolean;
};

export function computeWalletCdPreview(input: {
  walletBalance: string | null;
  savedCdAccountStatus: string;
  savedCdAmount: string;
  cdAccountStatus: string;
  cdAmount: string;
}): WalletCdPreview {
  const currentBalance =
    input.walletBalance != null && Number.isFinite(Number(input.walletBalance))
      ? Number(input.walletBalance)
      : null;
  const savedEffectiveCd = effectiveCdFromForm(input.savedCdAccountStatus, input.savedCdAmount);
  const newEffectiveCd = effectiveCdFromForm(input.cdAccountStatus, input.cdAmount);
  const cdDelta = newEffectiveCd - savedEffectiveCd;
  const projectedBalance = currentBalance != null ? currentBalance - cdDelta : null;
  const wouldGoNegative = projectedBalance != null && projectedBalance < 0;
  return {
    currentBalance,
    savedEffectiveCd,
    newEffectiveCd,
    cdDelta,
    projectedBalance,
    wouldGoNegative,
  };
}
