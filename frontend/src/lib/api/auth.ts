import { api } from "../api-client";

function clearPrivateBrowserState() {
    localStorage.removeItem("coach:msgs");
    navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_PRIVATE_CACHES" });
}

export const authApi = {
    verify: () => api.get<{ authenticated: boolean }>("/auth/verify"),

    login: (password: string) =>
        api.post<{ success: boolean }>("/auth/login", { password }),

    logout: async () => {
        const res = await api.post<void>("/auth/logout", {});
        clearPrivateBrowserState();
        return res;
    },
};
