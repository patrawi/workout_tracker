// src/services/bodyweight.service.ts

import type { BodyweightLogRow } from "../repositories/bodyweight.repository";
import { BODYWEIGHT_DEFAULT_DAYS_BACK } from "../constants";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger("bodyweight-service");

export interface BodyweightService {
  log(date: string, weight_kg: number): Promise<void>;
  getLogs(daysBack?: number): Promise<BodyweightLogRow[]>;
}

export function createBodyweightService(
  repo: ReturnType<typeof import("../repositories/bodyweight.repository").createBodyweightRepository>
): BodyweightService {
  return {
    async log(date: string, weight_kg: number): Promise<void> {
      logger.info("Logging bodyweight", { date, weight_kg });
      return repo.insert(date, weight_kg);
    },

    async getLogs(daysBack = BODYWEIGHT_DEFAULT_DAYS_BACK): Promise<BodyweightLogRow[]> {
      return repo.getAll(daysBack);
    },
  };
}
