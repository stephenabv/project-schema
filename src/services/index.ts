import "server-only";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import { DashboardService } from "./dashboard";
import { MissionService } from "./missions";
import { ProfileService } from "./profile";
import { ProgressionService } from "./progression";
import { RewardService } from "./rewards";
import { WalletService } from "./wallet";

export interface Services {
  rewards: RewardService;
  wallet: WalletService;
  dashboard: DashboardService;
  missions: MissionService;
  progression: ProgressionService;
  profile: ProfileService;
}

/** Composes the services around one user-scoped (RLS) Supabase client. */
export function createServices(db: AppSupabaseClient): Services {
  return {
    rewards: new RewardService(db),
    wallet: new WalletService(db),
    dashboard: new DashboardService(db),
    missions: new MissionService(db),
    progression: new ProgressionService(db),
    profile: new ProfileService(db),
  };
}

export { DashboardService, MissionService, ProfileService, ProgressionService, RewardService, WalletService };
