import { CsvImportMode } from "@prisma/client";

/**
 * CREATE_ONLY duplicate guard — Claim.claimNo is globally unique.
 * Re-import of an existing CCN must fail the row (never create a second claim).
 */
export function shouldRejectDuplicateClaim(
  importMode: CsvImportMode,
  existingClaimNo: string | null,
): boolean {
  return importMode === CsvImportMode.CREATE_ONLY && existingClaimNo != null;
}
