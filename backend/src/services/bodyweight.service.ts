// src/services/bodyweight.service.ts

import type { BodyweightLogRow } from "../repositories/bodyweight.repository";
import { BODYWEIGHT_DEFAULT_DAYS_BACK } from "../constants";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger("bodyweight-service");

// Legacy default: all pre-multi-user data belongs to the owner (user 1).
const DEFAULT_USER_ID = 1;

export interface BodyweightService {
  log(date: string, weight_kg: number, userId?: number): Promise<void>;
  getLogs(daysBack?: number, userId?: number): Promise<BodyweightLogRow[]>;
}

export function createBodyweightService(
  repo: ReturnType<typeof import("../repositories/bodyweight.repository").createBodyweightRepository>
): BodyweightService {
  return {
    async log(date: string, weight_kg: number, userId: number = DEFAULT_USER_ID): Promise<void> {
      logger.info("Logging bodyweight", { date, weight_kg, userId });
      return repo.insert(date, weight_kg, userId);
    },

    async getLogs(daysBack = BODYWEIGHT_DEFAULT_DAYS_BACK, userId: number = DEFAULT_USER_ID): Promise<BodyweightLogRow[]> {
      return repo.getAll(daysBack, userId);
    },
  };
}
