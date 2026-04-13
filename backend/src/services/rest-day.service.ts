// src/services/rest-day.service.ts

import type { RestDayInput, RestDayRow } from "../repositories/rest-day.repository";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger("rest-day-service");

export interface RestDayService {
  upsert(input: RestDayInput): Promise<RestDayRow>;
  delete(date: string): Promise<boolean>;
}

export function createRestDayService(
  repo: ReturnType<typeof import("../repositories/rest-day.repository").createRestDayRepository>
): RestDayService {
  return {
    async upsert(input: RestDayInput): Promise<RestDayRow> {
      logger.info("Upserting rest day", { date: input.date });
      return repo.upsert(input);
    },

    async delete(date: string): Promise<boolean> {
      logger.info("Deleting rest day", { date });
      return repo.delete(date);
    },
  };
}
