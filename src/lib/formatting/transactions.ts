import type { TransactionType } from "@/types/database";

const LABELS: Record<TransactionType, string> = {
  tap_reward: "Tap reward",
  mission_reward: "Mission reward",
  admin_adjustment: "Adjustment",
};

export function transactionTypeLabel(type: TransactionType): string {
  return LABELS[type];
}
