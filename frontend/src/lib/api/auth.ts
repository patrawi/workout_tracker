import { api } from "../api-client";

export const authApi = {
    verify: () => api.get<{ authenticated: boolean }>("/auth/verify"),

    login: (password: string) =>
        api.post<{ success: boolean }>("/auth/login", { password }),

    logout: () => api.post<void>("/auth/logout", {}),
};
