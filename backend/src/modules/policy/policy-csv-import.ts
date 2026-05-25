import type { Prisma } from "@prisma/client";
import {
  ChequeStatus,
  PayMethod,
  PaymentStatus,
  Prisma as PrismaNamespace,
} from "@prisma/client";
import type { GeoScope } from "../../services/mis-scope.service.js";
import { assertPolicyReadable } from "../../services/mis-scope.service.js";
import { normalizeMobile } from "../../domain/phone.js";
import {
  assertUniqueTransactionNumbersInBatch,
  normalizeTxnNumber,
  prepareYearPaymentReplace,
} from "./policy-payment.helpers.js";
import type { PaymentReplaceRow, PolicyMemberReplaceRow } from "./policy.schemas.js";
import {
  collectMembersFromCsvMap,
  collectPaymentsFromCsvMap,
} from "./policy-csv-slots.js";
import { getCsvField, rowToHeaderMap } from "./policy-csv-parse.js";

function parseOptionalDate(raw: string): Date | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid date: ${raw}`);
  return d;
}

function parseOptionalDecimal(raw: string): PrismaNamespace.Decimal | undefined | null {
  const t = raw.trim();
  if (!t) return undefined;
  if (/^(null|none|n\/a)$/i.test(t)) return null;
  try {
    return new PrismaNamespace.Decimal(t);
  } catch {
    throw new Error(`invalid number: ${raw}`);
  }
}

function parseOptionalInt(raw: string): number | undefined | null {
  const t = raw.trim();
  if (!t) return undefined;
  const n = Number.parseInt(t, 10);
  if (Number.isNaN(n)) throw new Error(`invalid integer: ${raw}`);
  return n;
}

function parseCdAccount(raw: string): boolean | undefined {
  const t = raw.trim().toLowerCase();
  if (!t) return undefined;
  if (["yes", "y", "true", "1"].includes(t)) return true;
  if (["no", "n", "false", "0"].includes(t)) return false;
  return undefined;
}

async function replaceYearMembersFromCsv(
  tx: Prisma.TransactionClient,
  policyYearId: string,
  members: PolicyMemberReplaceRow[],
): Promise<void> {
  await tx.member.updateMany({
    where: { policyYearId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (!members.length) return;
  await tx.member.createMany({
    data: members.map((m) => ({
      policyYearId,
      name: m.name,
      dob: m.dob,
      relationship: m.relationship,
      gender: m.gender,
      riderAmount: m.riderAmount ?? 0,
      sumInsured: m.sumInsured ?? undefined,
      cumulativeBonus: m.cumulativeBonus ?? undefined,
      dateOfJoining: m.dateOfJoining ?? undefined,
      memberPhone: m.memberPhone ?? undefined,
      addOnsAmount: m.addOnsAmount ?? undefined,
      basicPremium: m.basicPremium ?? undefined,
      ageAtEntry: m.ageAtEntry ?? undefined,
    })),
  });
}

async function insertPaymentsForYearCsv(
  tx: Prisma.TransactionClient,
  policyYearId: string,
  payments: PaymentReplaceRow[],
): Promise<void> {
  assertUniqueTransactionNumbersInBatch(payments);
  for (const paymentRow of payments) {
    const txnNumber = normalizeTxnNumber(paymentRow.transactionNumber ?? null);
    const mappedStatus =
      paymentRow.status === ChequeStatus.DISHONOURED
        ? PaymentStatus.FAILED
        : paymentRow.status === ChequeStatus.CLEARED
          ? PaymentStatus.COMPLETED
          : PaymentStatus.PENDING;
    let chequeId: string | undefined;
    if (paymentRow.method === PayMethod.CHQ && paymentRow.bankName && txnNumber) {
      const ch = await tx.cheque.create({
        data: {
          number: txnNumber,
          bankName: paymentRow.bankName,
          ifsc: paymentRow.ifscCode ?? undefined,
          status:
            paymentRow.status === ChequeStatus.DISHONOURED
              ? ChequeStatus.DISHONOURED
              : paymentRow.status === ChequeStatus.CLEARED
                ? ChequeStatus.CLEARED
                : ChequeStatus.PENDING,
          reason:
            paymentRow.status === ChequeStatus.DISHONOURED
              ? paymentRow.dishonourReason ?? "Dishonoured"
              : undefined,
          accountNo: paymentRow.accountNumber ?? undefined,
          branch: paymentRow.branchName ?? undefined,
          nameAsPerCheque: paymentRow.nameAsPerCheque ?? undefined,
          notOver: paymentRow.notOver ?? undefined,
          chequeDate: paymentRow.transactionDate ?? undefined,
        },
      });
      chequeId = ch.id;
    }
    await tx.payment.create({
      data: {
        policyYearId,
        amount: paymentRow.amount,
        method: paymentRow.method,
        status: mappedStatus,
        chequeId: chequeId ?? null,
        transactionNumber: txnNumber,
        transactionDate: paymentRow.transactionDate ?? undefined,
        bankName: paymentRow.bankName ?? undefined,
        branchName: paymentRow.branchName ?? undefined,
        accountNumber: paymentRow.accountNumber ?? undefined,
        nameAsPerCheque: paymentRow.nameAsPerCheque ?? undefined,
        ifscCode: paymentRow.ifscCode ?? undefined,
        notOver: paymentRow.notOver ?? undefined,
        dishonourReason: paymentRow.dishonourReason ?? undefined,
        returnCharges: paymentRow.returnCharges ?? undefined,
        otherCharges: paymentRow.otherCharges ?? undefined,
      },
    });
  }
}

async function replaceYearPaymentsFromCsv(
  tx: Prisma.TransactionClient,
  policyYearId: string,
  payments: PaymentReplaceRow[],
): Promise<void> {
  await prepareYearPaymentReplace(tx, policyYearId);
  if (payments.length > 0) {
    await insertPaymentsForYearCsv(tx, policyYearId, payments);
  }
}

export async function applyLegacyPolicyCsvRow(
  tx: Prisma.TransactionClient,
  header: string[],
  row: string[],
  ctx: { userId: string; permissions: Set<string>; scope: GeoScope },
): Promise<void> {
  const map = rowToHeaderMap(header, row);
  const refNo = getCsvField(map, "ref no");
  const svkkId = getCsvField(map, "SVKK ID");
  const policyNo = getCsvField(map, "policy no");

  if (!refNo && !svkkId && !policyNo) {
    throw new Error("ref no, SVKK ID, or policy no required");
  }

  const policy = await tx.policy.findFirst({
    where: {
      deletedAt: null,
      OR: [
        refNo ? { referenceNo: refNo } : undefined,
        svkkId ? { insuredParty: { svkkPublicId: svkkId } } : undefined,
        policyNo ? { policyNo } : undefined,
      ].filter(Boolean) as Prisma.PolicyWhereInput[],
    },
    include: {
      insuredParty: true,
      years: {
        where: { deletedAt: null },
        orderBy: { yearLabel: "desc" },
        include: {
          members: { where: { deletedAt: null }, orderBy: { name: "asc" } },
          payments: {
            where: { deletedAt: null },
            orderBy: { createdAt: "asc" },
            include: { cheque: true },
          },
        },
      },
    },
  });

  if (!policy) {
    throw new Error(
      `policy not found (ref no=${refNo || "—"}, SVKK ID=${svkkId || "—"}, policy no=${policyNo || "—"})`,
    );
  }

  assertPolicyReadable(policy, ctx.userId, ctx.permissions, ctx.scope);

  const yearLabel = getCsvField(map, "year") || policy.years[0]?.yearLabel;
  const year = yearLabel
    ? policy.years.find((y) => y.yearLabel === yearLabel) ?? policy.years[0]
    : policy.years[0];

  const partyUpdate: Prisma.InsuredPartyUpdateInput = {};
  const holderName = getCsvField(map, "Holder name");
  if (holderName) partyUpdate.name = holderName;
  const pan = getCsvField(map, "Holder PAN");
  if (pan) partyUpdate.pan = pan;
  const aadhaar = getCsvField(map, "Holder Aadhaar");
  if (aadhaar) partyUpdate.aadhaarNo = aadhaar;
  const customerId = getCsvField(map, "Customer ID");
  if (customerId) partyUpdate.customerId = customerId;
  const email = getCsvField(map, "email");
  if (email) partyUpdate.email = email;
  const holderDob = getCsvField(map, "Holder DOB");
  if (holderDob) partyUpdate.dateOfBirth = parseOptionalDate(holderDob);
  const primaryMobile = getCsvField(map, "Primary Mobile Number");
  if (primaryMobile) partyUpdate.mobile = normalizeMobile(primaryMobile);

  if (Object.keys(partyUpdate).length) {
    await tx.insuredParty.update({
      where: { id: policy.insuredPartyId },
      data: partyUpdate,
    });
  }

  const policyUpdate: Prisma.PolicyUpdateInput = {};
  const newPolicyNo = getCsvField(map, "policy no");
  if (newPolicyNo) policyUpdate.policyNo = newPolicyNo;
  const prevNo = getCsvField(map, "previous policy no");
  if (prevNo) policyUpdate.previousPolicyNo = prevNo;
  const village = getCsvField(map, "Village");
  if (village) policyUpdate.village = village;
  const grouping = getCsvField(map, "grouping");
  if (grouping) policyUpdate.policyGrouping = grouping;
  const month = getCsvField(map, "month");
  if (month) policyUpdate.periodMonthText = month;
  const periodYear = getCsvField(map, "year");
  if (periodYear) policyUpdate.periodYearText = periodYear;
  const insurance = getCsvField(map, "Insurance company");
  if (insurance) policyUpdate.insuranceCompany = insurance;
  const tpa = getCsvField(map, "TPA");
  if (tpa) policyUpdate.tpa = tpa;
  const category = getCsvField(map, "Category");
  if (category) policyUpdate.categoryText = category;
  const holderGender = getCsvField(map, "Holder gender");
  if (holderGender) policyUpdate.holderGender = holderGender;
  const holderRel = getCsvField(map, "Holder relationship");
  if (holderRel) policyUpdate.holderRelationship = holderRel;
  const holderAge = getCsvField(map, "Holder age");
  if (holderAge) policyUpdate.holderAge = parseOptionalInt(holderAge) ?? undefined;
  const persons = getCsvField(map, "Person Count*", "Persons insured");
  if (persons) policyUpdate.personsInsuredCount = parseOptionalInt(persons) ?? undefined;
  const loanStatus = getCsvField(map, "loan_status");
  if (loanStatus) policyUpdate.loanStatus = loanStatus;
  const loanAmt = getCsvField(map, "loan_amt");
  if (loanAmt) policyUpdate.loanAmount = parseOptionalDecimal(loanAmt);
  const cdStatus = getCsvField(map, "cd_account_status");
  const cdParsed = parseCdAccount(cdStatus);
  if (cdParsed !== undefined) policyUpdate.cdAccountUsed = cdParsed;
  const cdAmt = getCsvField(map, "cd_amount");
  if (cdAmt) policyUpdate.cdAmount = parseOptionalDecimal(cdAmt);
  const refundAmt = getCsvField(map, "Refund Cheque Amount");
  if (refundAmt) policyUpdate.refundChequeAmount = parseOptionalDecimal(refundAmt);
  const refundNo = getCsvField(map, "Refund Cheque Number");
  if (refundNo) policyUpdate.refundChequeNo = refundNo;
  const refundDate = getCsvField(map, "Refund Cheque Date");
  if (refundDate) policyUpdate.refundChequeDate = parseOptionalDate(refundDate);
  const nomineeName = getCsvField(map, "nominee_name");
  if (nomineeName) policyUpdate.nomineeName = nomineeName;
  const nomineeRel = getCsvField(map, "nominee_relation");
  if (nomineeRel) policyUpdate.nomineeRelation = nomineeRel;
  const addr1 = getCsvField(map, "Address Line 1: House/Flat No, Building Name");
  if (addr1) policyUpdate.addressLine1 = addr1;
  const addr2 = getCsvField(map, "Address Line 2: Street/Road Name");
  if (addr2) policyUpdate.addressLine2 = addr2;
  const addr3 = getCsvField(map, "Address Line 3: Landmark / Locality");
  if (addr3) policyUpdate.addressLine3 = addr3;
  const addr4 = getCsvField(map, "Address Line 4: Additional Details (optional)");
  if (addr4) policyUpdate.addressLine4 = addr4;
  const area = getCsvField(map, "area");
  if (area) policyUpdate.area = area;
  const city = getCsvField(map, "city");
  if (city) policyUpdate.city = city;
  const pincode = getCsvField(map, "pincode");
  if (pincode) policyUpdate.pincode = pincode;
  const secondary = getCsvField(map, "Secondary Mobile Number");
  if (secondary) policyUpdate.mobileSecondary = secondary;
  const whatsapp = getCsvField(map, "whatsapp");
  if (whatsapp) policyUpdate.whatsappNo = whatsapp;
  const notCourier = getCsvField(map, "not_courier");
  if (notCourier) policyUpdate.courierStatus = notCourier;
  const courierDate = getCsvField(map, "courier_date");
  if (courierDate) policyUpdate.courierDate = parseOptionalDate(courierDate);
  const courierAddr = getCsvField(map, "courier_address");
  if (courierAddr) policyUpdate.courierAddress = courierAddr;
  const pod = getCsvField(map, "pod");
  if (pod) policyUpdate.podNumber = pod;
  const courierCo = getCsvField(map, "courier co");
  if (courierCo) policyUpdate.courierCompany = courierCo;
  const genRemark = getCsvField(map, "gen remark");
  if (genRemark) policyUpdate.remarks = genRemark;
  const refFromCsv = getCsvField(map, "ref no");
  if (refFromCsv) policyUpdate.referenceNo = refFromCsv;

  if (Object.keys(policyUpdate).length) {
    await tx.policy.update({ where: { id: policy.id }, data: policyUpdate });
  }

  if (year) {
    const yearUpdate: Prisma.PolicyYearUpdateInput = {};
    const start = getCsvField(map, "Policy start");
    if (start) yearUpdate.policyStart = parseOptionalDate(start);
    const end = getCsvField(map, "Policy end");
    if (end) yearUpdate.policyEnd = parseOptionalDate(end);
    const sumInsured = getCsvField(map, "Sum insured");
    if (sumInsured) yearUpdate.sumInsured = parseOptionalDecimal(sumInsured);
    const hcb = getCsvField(map, "holder cumulative bonus");
    if (hcb) yearUpdate.holderCumulativeBonus = parseOptionalDecimal(hcb);
    const hjy = getCsvField(map, "holder joining year");
    if (hjy) yearUpdate.holderJoiningYear = hjy;
    const hbp = getCsvField(map, "holder basic premium");
    if (hbp) yearUpdate.holderBasicPremium = parseOptionalDecimal(hbp);
    const payMode = getCsvField(map, "mode of payment");
    if (payMode) yearUpdate.paymentMode = payMode;
    const gross = getCsvField(map, "Gross premium");
    if (gross) yearUpdate.grossPremium = parseOptionalDecimal(gross);
    const taxPct = getCsvField(map, "Tax %");
    if (taxPct) yearUpdate.taxPercent = parseOptionalDecimal(taxPct);
    const taxAmt = getCsvField(map, "Tax amount");
    if (taxAmt) yearUpdate.taxAmount = parseOptionalDecimal(taxAmt);
    const svkk = getCsvField(map, "SVKK premium");
    if (svkk) yearUpdate.svkkPremium = parseOptionalDecimal(svkk);
    const net = getCsvField(map, "Net premium");
    if (net) yearUpdate.netPremium = parseOptionalDecimal(net);
    const vkkComm = getCsvField(map, "VKK commission");
    if (vkkComm) yearUpdate.vkkCommission = parseOptionalDecimal(vkkComm);
    const commAmt = getCsvField(map, "Commission amount");
    if (commAmt) yearUpdate.commissionAmount = parseOptionalDecimal(commAmt);
    const php = getCsvField(map, "Policy Holder Premium");
    if (php) yearUpdate.yearPolicyHolderPremium = parseOptionalDecimal(php);
    const tlf = getCsvField(map, "Two lac floater");
    if (tlf) yearUpdate.twoLacFloater = parseOptionalDecimal(tlf);
    const gmc = getCsvField(map, "Gaam mahajan contribution");
    if (gmc) yearUpdate.gaamMahajanContribution = parseOptionalDecimal(gmc);
    const excess = getCsvField(map, "Excess / short");
    if (excess) yearUpdate.excessShortAmount = parseOptionalDecimal(excess);
    const diff = getCsvField(map, "Diff paid by holder");
    if (diff) yearUpdate.diffPaidByHolder = parseOptionalDecimal(diff);
    const yearRemarks = getCsvField(map, "policy remar");
    if (yearRemarks) yearUpdate.yearRemarks = yearRemarks;

    if (Object.keys(yearUpdate).length) {
      await tx.policyYear.update({ where: { id: year.id }, data: yearUpdate });
    }

    const membersFromCsv = collectMembersFromCsvMap(map);
    if (membersFromCsv.length > 0) {
      await replaceYearMembersFromCsv(tx, year.id, membersFromCsv);
    }

    const paymentsFromCsv = collectPaymentsFromCsvMap(map);
    if (paymentsFromCsv.length > 0) {
      await replaceYearPaymentsFromCsv(tx, year.id, paymentsFromCsv);
    }
  }
}

export function validateLegacyPolicyCsvRow(header: string[], row: string[]): void {
  const map = rowToHeaderMap(header, row);
  const refNo = getCsvField(map, "ref no");
  const svkkId = getCsvField(map, "SVKK ID");
  const policyNo = getCsvField(map, "policy no");
  if (!refNo && !svkkId && !policyNo) {
    throw new Error("ref no, SVKK ID, or policy no required");
  }
  collectMembersFromCsvMap(map);
  collectPaymentsFromCsvMap(map);
}
