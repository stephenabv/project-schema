/**
 * Database types in the shape produced by `supabase gen types typescript`.
 * Regenerate with `npm run db:types` after changing migrations.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type TransactionType = "tap_reward" | "mission_reward" | "achievement_reward" | "admin_adjustment";

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      player_profiles: {
        Row: { id: string; username: string; avatar_url: string | null; avatar_key: string; created_at: string };
        Insert: { id: string; username: string; avatar_url?: string | null; avatar_key?: string; created_at?: string };
        Update: { id?: string; username?: string; avatar_url?: string | null; avatar_key?: string; created_at?: string };
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
