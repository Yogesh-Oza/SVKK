export type PremiumStatus =
  | "completed"
  | "processing"
  | "pending"
  | "failed"
  | "refunded"
  | "disputed";

export type PremiumMethod =
  | "UPI"
  | "NEFT"
  | "Cash"
  | "Cheque"
  | "Card"
  | "Bank transfer";

export type PremiumReceipt = {
  id: string;
  reference: string;
  customerName: string;
  email: string;
  amount: number;
  status: PremiumStatus;
  method: PremiumMethod;
  gateway: string;
  net: number;
  at: string;
};

export type MonthlyPremium = { month: string; premium: number; target: number };

export type PremiumBreakdownItem = { label: string; value: number; amount: number };
