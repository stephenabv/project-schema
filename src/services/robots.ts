import "server-only";
import { toAppError } from "@/lib/supabase/errors";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import {
  robotCollectResultSchema,
  robotGeneratorSchema,
  robotPurchaseResultSchema,
  robotShopSchema,
  robotToggleResultSchema,
  type RobotCollectResult,
  type RobotGenerator,
  type RobotPurchaseResult,
  type RobotShop,
  type RobotToggleResult,
} from "@/lib/validation/robots";
import { parseContract } from "./contract";

/**
 * Robot workers. Prices, limits, balances and accrual are decided by the
 * database from its own clock; the client names a robot and sends an
 * idempotency key, never an amount.
 */
export class RobotService {
  constructor(private readonly db: AppSupabaseClient) {}

  async shop(): Promise<RobotShop> {
    const { data, error } = await this.db.rpc("list_robot_shop");
    if (error) throw toAppError(error, "list_robot_shop");
    return parseContract(robotShopSchema, data, "list_robot_shop");
  }

  async purchase(robotId: string, idempotencyKey: string): Promise<RobotPurchaseResult> {
    const { data, error } = await this.db.rpc("purchase_robot", { p_robot_id: robotId, p_idempotency_key: idempotencyKey });
    if (error) throw toAppError(error, "purchase_robot");
    return parseContract(robotPurchaseResultSchema, data, "purchase_robot");
  }

  async generator(): Promise<RobotGenerator> {
    const { data, error } = await this.db.rpc("get_robot_generator");
    if (error) throw toAppError(error, "get_robot_generator");
    return parseContract(robotGeneratorSchema, data, "get_robot_generator");
  }

  async collect(idempotencyKey: string): Promise<RobotCollectResult> {
    const { data, error } = await this.db.rpc("collect_robot_earnings", { p_idempotency_key: idempotencyKey });
    if (error) throw toAppError(error, "collect_robot_earnings");
    return parseContract(robotCollectResultSchema, data, "collect_robot_earnings");
  }

  async setActive(userRobotId: string, active: boolean, idempotencyKey: string): Promise<RobotToggleResult> {
    const { data, error } = await this.db.rpc("set_robot_active", {
      p_user_robot_id: userRobotId,
      p_active: active,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw toAppError(error, "set_robot_active");
    return parseContract(robotToggleResultSchema, data, "set_robot_active");
  }
}
