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

    // Show a loading skeleton while checking auth - maintain page structure to avoid CLS
    if (isCheckingAuth) {
        return (
            <div className="min-h-screen flex flex-col">
                <div
                    className="fixed inset-0 pointer-events-none -z-10"
                    aria-hidden="true"
                    style={{
                        background:
                            "radial-gradient(ellipse 60% 40% at 50% 0%, oklch(0.3 0.15 160 / 0.15), transparent), radial-gradient(ellipse 40% 50% at 80% 20%, oklch(0.25 0.15 290 / 0.1), transparent)",
                    }}
                />
                <Header onLogout={logout} />
                <div className="flex-1 flex items-center justify-center">
                    <div className="animate-spin h-8 w-8 border-2 border-white/20 border-t-white rounded-full" />
                </div>
                <PWAInstallPrompt />
            </div>
        );
    }

    // Show login page if not authenticated
    if (!isAuthenticated) {
        return <LoginPage />;
    }

    return (
        <div className="min-h-screen flex flex-col">
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
            <div className="flex-1">
                <Outlet />
            </div>

            {/* PWA Install Prompt */}
            <PWAInstallPrompt />
        </div>
    );
}
