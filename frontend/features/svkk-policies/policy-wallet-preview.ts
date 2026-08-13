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

export type WalletCdPreview = {
  currentBalance: number | null;
  savedEffectiveCd: number;
  newEffectiveCd: number;
  cdDelta: number;
  projectedBalance: number | null;
  wouldGoNegative: boolean;
};

export type WalletCdPreviewInput = {
  walletBalance: string | null;
  savedCdAccountStatus: string;
  savedCdAmount: string;
  cdAccountStatus: string;
  cdAmount: string;
};

export function savedCdFieldsFromPolicy(
  detail: SvkkPolicyDetailForForm | null | undefined,
): Pick<WalletCdPreviewInput, "savedCdAccountStatus" | "savedCdAmount"> {
  if (!detail) {
    return { savedCdAccountStatus: "", savedCdAmount: "" };
  }
  return {
    savedCdAccountStatus:
      detail.cdAccountUsed === true ? "YES" : detail.cdAccountUsed === false ? "NO" : "",
    savedCdAmount: detail.cdAmount != null ? String(detail.cdAmount) : "",
  };
}

export function computeWalletCdPreview(input: WalletCdPreviewInput): WalletCdPreview {
  const currentBalance =
    input.walletBalance != null && Number.isFinite(Number(input.walletBalance))
      ? Number(input.walletBalance)
      : null;
  const savedEffectiveCd = effectiveCdFromForm(input.savedCdAccountStatus, input.savedCdAmount);
  const newEffectiveCd = effectiveCdFromForm(input.cdAccountStatus, input.cdAmount);
  const cdDelta = newEffectiveCd - savedEffectiveCd;
  const projectedBalance = currentBalance != null ? currentBalance - cdDelta : null;
  const wouldGoNegative =
    cdDelta > 0 && projectedBalance != null && projectedBalance < 0;
  return {
    currentBalance,
    savedEffectiveCd,
    newEffectiveCd,
    cdDelta,
    projectedBalance,
    wouldGoNegative,
  };
}
