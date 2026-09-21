// src/services/rest-day.service.ts

import type { RestDayInput, RestDayRow } from "../repositories/rest-day.repository";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger("rest-day-service");

// Legacy default: all pre-multi-user data belongs to the owner (user 1).
const DEFAULT_USER_ID = 1;

export interface RestDayService {
  upsert(input: RestDayInput, userId?: number): Promise<RestDayRow>;
  delete(date: string, userId?: number): Promise<boolean>;
}

export function createRestDayService(
  repo: ReturnType<typeof import("../repositories/rest-day.repository").createRestDayRepository>
): RestDayService {
  return {
    async upsert(input: RestDayInput, userId: number = DEFAULT_USER_ID): Promise<RestDayRow> {
      logger.info("Upserting rest day", { date: input.date, userId });
      return repo.upsert(input, userId);
    },

    async delete(date: string, userId: number = DEFAULT_USER_ID): Promise<boolean> {
      logger.info("Deleting rest day", { date, userId });
      return repo.delete(date, userId);
    },
  };
}
