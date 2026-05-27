import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import Header from "./Header";
import LoginPage from "./LoginPage";
import PWAInstallPrompt from "./PWAInstallPrompt";
import { useAuthContext } from "@/context/AuthContext";

export default function Layout() {
    const { isAuthenticated, isCheckingAuth, logout } = useAuthContext();
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Render app shell immediately while auth verifies in background.
    // Only show a login overlay if auth is confirmed as unauthenticated.
    // This avoids blocking FCP on the /api/auth/verify round-trip.
    if (!isCheckingAuth && !isAuthenticated) {
        return <LoginPage />;
    }

    return (
        <div className="min-h-screen flex flex-col">
            {/* Skip to content link */}
            <a
                href="#content"
                className="visually-hidden focus:not-visually-hidden focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-[var(--color-accent-500)] focus:text-black focus:rounded-lg focus:font-medium"
            >
                Skip to content
            </a>

            {/* Centralized live regions for dynamic announcements */}
            <div aria-live="polite" aria-atomic="true" className="visually-hidden" />
            <div aria-live="assertive" className="visually-hidden" />

            {/* Background ambient glow - Persistent across all routes */}
            <div
                className="fixed inset-0 pointer-events-none -z-10"
                aria-hidden="true"
                style={{
                    background:
                        "radial-gradient(ellipse 60% 40% at 50% 0%, oklch(0.3 0.15 160 / 0.15), transparent), radial-gradient(ellipse 40% 50% at 80% 20%, oklch(0.25 0.15 290 / 0.1), transparent)",
                }}
            />

            {/* Offline Banner */}
            {!isOnline && (
                <div className="bg-orange-600 text-white text-center text-sm py-2 px-4 font-medium">
                    You are offline — some features may not work
                </div>
            )}

            {/* Persistent Global Header */}
            <Header onLogout={logout} />

            {/* Dynamic Page Content */}
            <div id="content" tabIndex={-1} className="flex-1 outline-none">
                <Outlet />
            </div>

            {/* PWA Install Prompt */}
            <PWAInstallPrompt />
        </div>
    );
}
