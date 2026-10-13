import "server-only";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import { AccountService } from "./account";
import { AdminService } from "./admin";
import { BonusService } from "./bonus";
import { DashboardService } from "./dashboard";
import { LeaderboardService } from "./leaderboard";
import { MissionService } from "./missions";
import { NotificationService } from "./notifications";
import { ProfileService } from "./profile";
import { ProgressionService } from "./progression";
import { RewardService } from "./rewards";
import { ShopService } from "./shop";
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
  bonus: BonusService;
  leaderboard: LeaderboardService;
  shop: ShopService;
  notifications: NotificationService;
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
    bonus: new BonusService(db),
    leaderboard: new LeaderboardService(db),
    shop: new ShopService(db),
    notifications: new NotificationService(db),
  };
}

export {
  AccountService,
  AdminService,
  BonusService,
  DashboardService,
  LeaderboardService,
  MissionService,
  NotificationService,
  ProfileService,
  ProgressionService,
  RewardService,
  ShopService,
  WalletService,
};
