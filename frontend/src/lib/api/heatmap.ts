import { api } from "../api-client";

export interface HeatmapDay {
    date: string;
    count: number;
    isRestDay?: boolean;
    walked_10k?: boolean;
    did_liss?: boolean;
    did_stretch?: boolean;
}

export const heatmapApi = {
    get: () => api.get<HeatmapDay[]>("/heatmap"),
};
