import type { ApiResponse } from "@/types";

const API_BASE = "/api";

interface RequestOptions extends RequestInit {
    priority?: "low" | "auto" | "high";
}

async function request<T>(
    endpoint: string,
    options?: RequestOptions
): Promise<ApiResponse<T>> {
    const { priority, ...init } = options ?? {};

    const res = await fetch(`${API_BASE}${endpoint}`, {
        ...init,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...init.headers,
        },
        // priority is a newer fetch option (Baseline 2024)
        priority: priority ?? "auto",
    });

    return res.json();
}

export const api = {
    get: <T>(endpoint: string, priority?: "low" | "auto" | "high"): Promise<ApiResponse<T>> =>
        request<T>(endpoint, { priority }),

    post: <T>(endpoint: string, body: unknown): Promise<ApiResponse<T>> =>
        request<T>(endpoint, {
            method: "POST",
            body: JSON.stringify(body),
        }),

    put: <T>(endpoint: string, body: unknown): Promise<ApiResponse<T>> =>
        request<T>(endpoint, {
            method: "PUT",
            body: JSON.stringify(body),
        }),

    patch: <T>(endpoint: string, body: unknown): Promise<ApiResponse<T>> =>
        request<T>(endpoint, {
            method: "PATCH",
            body: JSON.stringify(body),
        }),

    del: <T>(endpoint: string): Promise<ApiResponse<T>> =>
        request<T>(endpoint, {
            method: "DELETE",
        }),
};
