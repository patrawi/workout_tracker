// src/services/history.service.ts

import type { HistoryDate } from "../repositories/history.repository";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger("history-service");

// Legacy default: all pre-multi-user data belongs to the owner (user 1).
const DEFAULT_USER_ID = 1;

export interface HistoryService {
  getDates(userId?: number): Promise<HistoryDate[]>;
}

export function createHistoryService(
  repo: ReturnType<typeof import("../repositories/history.repository").createHistoryRepository>
): HistoryService {
  return {
    async getDates(userId: number = DEFAULT_USER_ID): Promise<HistoryDate[]> {
      return repo.getDates(userId);
    },
  };
}
