import { Outlet } from "react-router-dom";
import Header from "./Header";
import LoginPage from "./LoginPage";
import { useAuthContext } from "@/context/AuthContext";

export default function Layout() {
    const { isAuthenticated, isCheckingAuth, logout } = useAuthContext();

    // Show a loading spinner while checking auth
    if (isCheckingAuth) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin h-8 w-8 border-2 border-white/20 border-t-white rounded-full" />
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

            {/* Persistent Global Header */}
            <Header onLogout={logout} />

            {/* Dynamic Page Content */}
            <div className="flex-1">
                <Outlet />
            </div>
        </div>
    );
}
