// src/services/history.service.ts

import type { HistoryDate } from "../repositories/history.repository";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger("history-service");

export interface HistoryService {
  getDates(): Promise<HistoryDate[]>;
}

export function createHistoryService(
  repo: ReturnType<typeof import("../repositories/history.repository").createHistoryRepository>
): HistoryService {
  return {
    async getDates(): Promise<HistoryDate[]> {
      return repo.getDates();
    },
  };
}
