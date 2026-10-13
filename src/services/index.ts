import "server-only";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import { DashboardService } from "./dashboard";
import { RewardService } from "./rewards";
import { WalletService } from "./wallet";

export interface Services {
  rewards: RewardService;
  wallet: WalletService;
  dashboard: DashboardService;
}

/** Composes the services around one user-scoped (RLS) Supabase client. */
export function createServices(db: AppSupabaseClient): Services {
  return {
    rewards: new RewardService(db),
    wallet: new WalletService(db),
    dashboard: new DashboardService(db),
  };
}

export { DashboardService, RewardService, WalletService };
