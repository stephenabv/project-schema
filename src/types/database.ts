/**
 * Database types in the shape produced by `supabase gen types typescript`.
 * Regenerate with `npm run db:types` after changing migrations.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type TransactionType =
  | "tap_reward"
  | "mission_reward"
  | "achievement_reward"
  | "daily_bonus"
  | "shop_purchase"
  | "idle_reward"
  | "generator_upgrade"
  | "admin_adjustment";

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      player_profiles: {
        Row: {
          id: string;
          username: string;
          avatar_url: string | null;
          avatar_key: string;
          created_at: string;
          suspended_at: string | null;
          suspension_reason: string | null;
          leaderboard_opt_out: boolean;
        };
        Insert: { id: string; username: string; avatar_url?: string | null; avatar_key?: string; created_at?: string };
        Update: {
          id?: string;
          username?: string;
          avatar_url?: string | null;
          avatar_key?: string;
          created_at?: string;
          leaderboard_opt_out?: boolean;
        };
        Relationships: [];
      };
      wallets: {
        Row: { user_id: string; balance_coins: number; updated_at: string };
        Insert: { user_id: string; balance_coins?: number; updated_at?: string };
        Update: { user_id?: string; balance_coins?: number; updated_at?: string };
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          amount_coins: number;
          type: string;
          source_type: string;
          source_id: string | null;
          idempotency_key: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          amount_coins: number;
          type: string;
          source_type: string;
          source_id?: string | null;
          idempotency_key: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      tap_state: {
        Row: { user_id: string; last_tap_at: string | null; activity_date: string; taps_today: number };
        Insert: { user_id: string; last_tap_at?: string | null; activity_date?: string; taps_today?: number };
        Update: { user_id?: string; last_tap_at?: string | null; activity_date?: string; taps_today?: number };
        Relationships: [];
      };
      user_roles: {
        Row: { user_id: string; role: string };
        Insert: { user_id: string; role?: string };
        Update: { user_id?: string; role?: string };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      ve_list_notifications: { Args: { p_limit?: number }; Returns: Json };
      ve_unread_notification_count: { Args: Record<PropertyKey, never>; Returns: number };
      ve_mark_notifications_read: { Args: { p_ids?: string[] | null }; Returns: number };
      get_daily_bonus_status: { Args: Record<PropertyKey, never>; Returns: Json };
      claim_daily_bonus: { Args: { p_idempotency_key: string }; Returns: Json };
      get_leaderboard: { Args: { p_board?: string; p_limit?: number }; Returns: Json };
      list_shop: { Args: Record<PropertyKey, never>; Returns: Json };
      get_equipped_cosmetics: { Args: Record<PropertyKey, never>; Returns: Json };
      purchase_item: { Args: { p_item_id: string; p_idempotency_key: string }; Returns: Json };
      equip_item: { Args: { p_item_id: string; p_equip?: boolean }; Returns: Json };
      get_account_status: { Args: Record<PropertyKey, never>; Returns: Json };
      get_app_config: { Args: Record<PropertyKey, never>; Returns: Json };
      get_generator_status: { Args: Record<PropertyKey, never>; Returns: Json };
      collect_generator: { Args: { p_idempotency_key: string }; Returns: Json };
      upgrade_generator: { Args: { p_idempotency_key: string }; Returns: Json };
      ve_admin_update_feature_flags: { Args: { p_flags: Json }; Returns: Json };
      ve_admin_set_maintenance: { Args: { p_enabled: boolean; p_message?: string | null }; Returns: Json };
      ve_admin_schedule_task: {
        Args: { p_task_id: string; p_publish_at: string | null; p_unpublish_at: string | null };
        Returns: Json;
      };
      ve_admin_economy_series: { Args: { p_days?: number }; Returns: Json };
      ve_admin_retention: { Args: { p_weeks?: number }; Returns: Json };
      ve_admin_engagement_summary: { Args: Record<PropertyKey, never>; Returns: Json };
      ve_admin_overview: { Args: Record<PropertyKey, never>; Returns: Json };
      ve_admin_activity_series: {
        Args: { p_days?: number };
        Returns: {
          day: string;
          active_players: number;
          new_players: number;
          taps: number;
          coins_issued: number;
          missions_claimed: number;
          duplicate_requests: number;
        }[];
      };
      ve_admin_suspicious_activity: { Args: { p_days?: number }; Returns: Json };
      ve_admin_list_users: { Args: { p_search?: string | null; p_limit?: number; p_offset?: number }; Returns: Json };
      ve_admin_set_suspension: {
        Args: { p_user_id: string; p_suspended: boolean; p_reason?: string | null };
        Returns: Json;
      };
      ve_admin_set_role: { Args: { p_user_id: string; p_role: string }; Returns: Json };
      ve_admin_adjust_balance: {
        Args: { p_user_id: string; p_amount: number; p_reason: string; p_idempotency_key: string };
        Returns: Json;
      };
      ve_admin_list_tasks: { Args: Record<PropertyKey, never>; Returns: Json };
      ve_admin_save_task: { Args: { p_task_id: string | null; p_task: Json }; Returns: Json };
      ve_admin_list_achievements: { Args: Record<PropertyKey, never>; Returns: Json };
      ve_admin_save_achievement: { Args: { p_id: string | null; p_achievement: Json }; Returns: Json };
      ve_admin_get_settings: { Args: Record<PropertyKey, never>; Returns: Json };
      ve_admin_update_tap_policy: { Args: { p_policy: Json }; Returns: Json };
      ve_admin_list_audit_logs: {
        Args: {
          p_action?: string | null;
          p_target_id?: string | null;
          p_actor_id?: string | null;
          p_from?: string | null;
          p_to?: string | null;
          p_before_created_at?: string | null;
          p_before_id?: string | null;
          p_limit?: number;
        };
        Returns: Json;
      };
      claim_task: {
        Args: { p_task_id: string; p_idempotency_key: string };
        Returns: Json;
      };
      list_missions: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      list_achievements: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_progression: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_reward_history: {
        Args: { p_bucket?: string; p_points?: number };
        Returns: { period_start: string; coins: number }[];
      };
      process_tap: {
        Args: { p_idempotency_key: string };
        Returns: Json;
      };
      tap_policy: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_dashboard_summary: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_reward_series: {
        Args: { p_days?: number };
        Returns: { day: string; coins: number }[];
      };
      list_transactions: {
        Args: {
          p_limit?: number;
          p_cursor_created_at?: string | null;
          p_cursor_id?: string | null;
          p_type?: string | null;
          p_from?: string | null;
          p_to?: string | null;
        };
        Returns: {
          id: string;
          amount_coins: number;
          type: string;
          source_type: string;
          source_id: string | null;
          created_at: string;
        }[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
