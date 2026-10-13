import "server-only";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import { AccountService } from "./account";
import { AdminService } from "./admin";
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
  account: AccountService;
  admin: AdminService;
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
    account: new AccountService(db),
    admin: new AdminService(db),
  };
}

export { AccountService, AdminService, DashboardService, MissionService, ProfileService, ProgressionService, RewardService, WalletService };
