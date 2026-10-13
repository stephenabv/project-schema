import type { TransactionType } from "@/types/database";

const LABELS: Record<TransactionType, string> = {
  tap_reward: "Tap reward",
  mission_reward: "Mission reward",
  achievement_reward: "Badge reward",
  daily_bonus: "Daily bonus",
  shop_purchase: "Shop purchase",
  idle_reward: "Generator output",
  generator_upgrade: "Generator upgrade",
  admin_adjustment: "Adjustment",
};

export function transactionTypeLabel(type: TransactionType): string {
  return LABELS[type];
}
