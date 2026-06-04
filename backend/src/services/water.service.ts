// src/services/water.service.ts

import type { WaterLogRow } from "../db/mappers";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger("water-service");

export interface WaterService {
  getByDate(date: string): Promise<WaterLogRow>;
  set(date: string, glasses: number): Promise<WaterLogRow>;
}

export function createWaterService(
  repo: ReturnType<typeof import("../repositories/water.repository").createWaterRepository>,
): WaterService {
  return {
    async getByDate(date: string): Promise<WaterLogRow> {
      return repo.getByDate(date);
    },

    async set(date: string, glasses: number): Promise<WaterLogRow> {
      const safe = Math.max(0, Math.round(glasses));
      logger.info("Setting water", { date, glasses: safe });
      return repo.set(date, safe);
    },
  };
}
