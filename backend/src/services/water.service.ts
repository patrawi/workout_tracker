// src/services/water.service.ts

import type { WaterLogRow } from "../db/mappers";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger("water-service");

// Legacy default: all pre-multi-user data belongs to the owner (user 1).
const DEFAULT_USER_ID = 1;

export interface WaterService {
  getByDate(date: string, userId?: number): Promise<WaterLogRow>;
  set(date: string, glasses: number, userId?: number): Promise<WaterLogRow>;
}

export function createWaterService(
  repo: ReturnType<typeof import("../repositories/water.repository").createWaterRepository>,
): WaterService {
  return {
    async getByDate(date: string, userId: number = DEFAULT_USER_ID): Promise<WaterLogRow> {
      return repo.getByDate(date, userId);
    },

    async set(date: string, glasses: number, userId: number = DEFAULT_USER_ID): Promise<WaterLogRow> {
      const safe = Math.max(0, Math.round(glasses));
      logger.info("Setting water", { date, glasses: safe, userId });
      return repo.set(date, safe, userId);
    },
  };
}
