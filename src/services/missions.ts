import "server-only";
import { z } from "zod";
import { toAppError } from "@/lib/supabase/errors";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import { claimResultSchema, missionSchema } from "@/lib/validation/missions";
import type { ClaimResponse, Mission } from "@/types/api";
import { parseContract } from "./contract";

/**
 * Missions for the current UTC day / ISO week. Eligibility, the reward and
 * one-claim-per-period are enforced by public.claim_task in the database.
 */
export class MissionService {
  constructor(private readonly db: AppSupabaseClient) {}

  async list(): Promise<Mission[]> {
    const { data, error } = await this.db.rpc("list_missions");
    if (error) throw toAppError(error, "list_missions");
    return parseContract(z.array(missionSchema), data, "list_missions");
  }

  async claim(taskId: string, idempotencyKey: string): Promise<ClaimResponse> {
    const { data, error } = await this.db.rpc("claim_task", {
      p_task_id: taskId,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw toAppError(error, "claim_task");
    return parseContract(claimResultSchema, data, "claim_task");
  }
}
