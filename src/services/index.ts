import "server-only";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import { AccountService } from "./account";
import { AdminService } from "./admin";
import { BonusService } from "./bonus";
import { ConfigService } from "./config";
import { DashboardService } from "./dashboard";
import { FinanceAdminService } from "./finance-admin";
import { GeneratorService } from "./generator";
import { LeaderboardService } from "./leaderboard";
import { MissionService } from "./missions";
import { NotificationService } from "./notifications";
import { ProfileService } from "./profile";
import { ProgressionService } from "./progression";
import { RedemptionService } from "./redemption";
import { RewardService } from "./rewards";
import { RobotService } from "./robots";
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
  generator: GeneratorService;
  config: ConfigService;
  robots: RobotService;
  redemption: RedemptionService;
  financeAdmin: FinanceAdminService;
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
    generator: new GeneratorService(db),
    config: new ConfigService(db),
    robots: new RobotService(db),
    redemption: new RedemptionService(db),
    financeAdmin: new FinanceAdminService(db),
  };
}

export {
  AccountService,
  AdminService,
  BonusService,
  ConfigService,
  DashboardService,
  FinanceAdminService,
  GeneratorService,
  LeaderboardService,
  MissionService,
  NotificationService,
  ProfileService,
  ProgressionService,
  RedemptionService,
  RewardService,
  RobotService,
  ShopService,
  WalletService,
};
