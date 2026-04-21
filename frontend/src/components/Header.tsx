import { useState, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, BarChart3, BookOpen, UtensilsCrossed, User as UserIcon, LogOut } from "lucide-react";

interface HeaderProps {
    onLogout?: () => void;
}

const NAV_LINKS = [
    { name: "Analytics", path: "/analytics", icon: BarChart3 },
    { name: "History", path: "/history", icon: BookOpen },
    { name: "Nutrition", path: "/nutrition", icon: UtensilsCrossed },
    { name: "Profile", path: "/profile", icon: UserIcon },
] as const;

export default function Header({ onLogout }: HeaderProps) {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const location = useLocation();

    const isActive = (path: string) => location.pathname === path;

    const navLinks = useMemo(
        () =>
            NAV_LINKS.map((link) => ({
                name: link.name,
                path: link.path,
                Icon: link.icon,
            })),
        [],
    );

    return (
        <header className="sticky top-0 z-50 py-4 px-4 sm:px-6 mb-8 backdrop-blur-xl bg-[var(--background)]/80 border-b border-[var(--border)] shadow-sm">
            <div className="max-w-4xl mx-auto flex items-center justify-between">
                <Link to="/" className="flex items-center gap-3 group" onClick={() => setIsMobileMenuOpen(false)}>
                    <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-[var(--card)] border border-[var(--border)] group-hover:border-[var(--chart-2)]/30 transition-colors">
                        <span className="text-xl leading-none relative z-10" role="img" aria-label="Dumbbell">
                            🏋️
                        </span>
                        <div
                            className="absolute -inset-1 rounded-full opacity-40 blur-md pointer-events-none group-hover:opacity-70 transition-opacity"
                            style={{
                                background: "radial-gradient(circle, oklch(0.7 0.2 160), transparent)",
                            }}
                            aria-hidden="true"
                        />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-gradient leading-none group-hover:brightness-110 transition-all">
                            Frictionless
                        </h1>
                        <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-medium mt-0.5">
                            AI Tracker
                        </p>
                    </div>
                </Link>

                {/* Desktop Navigation */}
                <nav className="hidden sm:flex items-center gap-1.5 bg-white/5 rounded-2xl p-1 backdrop-blur-sm">
                    {navLinks.map((link) => (
                        <Link
                            key={link.path}
                            to={link.path}
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${isActive(link.path)
                                    ? "bg-white/10 text-white shadow-sm"
                                    : "text-[var(--muted-foreground)] hover:text-white hover:bg-white/5"
                                }`}
                        >
                            <link.Icon className="w-4 h-4" />
                            {link.name}
                        </Link>
                    ))}

                    {onLogout && (
                        <>
                            <div className="w-px h-5 bg-white/10 mx-1"></div>
                            <button
                                onClick={onLogout}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-[var(--muted-foreground)] hover:text-red-400 hover:bg-red-500/10 transition-all duration-300 group"
                                title="Log out"
                            >
                                <LogOut className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                                Logout
                            </button>
                        </>
                    )}
                </nav>

                {/* Mobile Menu Toggle */}
                <button
                    className="sm:hidden p-2 text-[var(--muted-foreground)] hover:text-white hover:bg-white/5 rounded-xl transition-colors"
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    aria-label="Toggle menu"
                >
                    {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>
            </div>

            {/* Mobile Navigation Dropdown */}
            {isMobileMenuOpen && (
                <div className="sm:hidden absolute top-full left-0 right-0 py-4 px-4 bg-[var(--background)]/95 backdrop-blur-xl border-b border-[var(--border)] shadow-2xl animate-fade-in origin-top">
                    <nav className="flex flex-col gap-2 mx-auto">
                        {navLinks.map((link) => (
                            <Link
                                key={link.path}
                                to={link.path}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-base font-medium transition-all duration-300 ${isActive(link.path)
                                        ? "bg-white/10 text-white shadow-sm border border-white/5"
                                        : "text-[var(--muted-foreground)] hover:text-white hover:bg-white/5"
                                    }`}
                            >
                                <div className={`p-1.5 rounded-lg ${isActive(link.path) ? 'bg-[var(--chart-2)]/20 text-[var(--chart-2)]' : 'bg-white/5 text-[var(--muted-foreground)]'}`}>
                                    <link.Icon className="w-4 h-4" />
                                </div>
                                {link.name}
                            </Link>
                        ))}

                        {onLogout && (
                            <>
                                <div className="h-px w-full bg-white/5 my-2"></div>
                                <button
                                    onClick={() => {
                                        setIsMobileMenuOpen(false);
                                        onLogout();
                                    }}
                                    className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-base font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors text-left"
                                >
                                    <div className="p-1.5 rounded-lg bg-red-500/10 text-red-400">
                                        <LogOut className="w-4 h-4" />
                                    </div>
                                    Logout
                                </button>
                            </>
                        )}
                    </nav>
                </div>
            )}
        </header>
    );
}

