import { api } from "../api-client";

export interface CatalogSyncResult {
    added: number;
    updated: number;
    skipped: number;
    total: number;
}

export const foodCatalogApi = {
    sync: () => api.post<CatalogSyncResult>("/food-catalog/sync", {}),

    count: () => api.get<{ count: number }>("/food-catalog/count"),
};
