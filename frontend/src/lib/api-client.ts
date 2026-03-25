import type { ApiResponse } from "@/types";

const API_BASE = "/api";

async function request<T>(
    endpoint: string,
    options?: RequestInit
): Promise<ApiResponse<T>> {
    const url = `${API_BASE}${endpoint}`;

    const res = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...options?.headers,
        },
    });

    return res.json();
}

export const api = {
    get: <T>(endpoint: string): Promise<ApiResponse<T>> =>
        request<T>(endpoint),

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
