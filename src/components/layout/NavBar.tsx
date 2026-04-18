// =============================================================================
// NavBar
// Top navigation bar shared across all pages.
// Displays the Schema Weaver logo, page links, and settings button.
// =============================================================================

import { Link, useLocation } from 'react-router-dom';
import { Bot, Database, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NavBarProps {
    onOpenSettings?: () => void;
}

export function NavBar({ onOpenSettings }: NavBarProps) {
    const location = useLocation();

    const isActive = (path: string) =>
        path === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(path);

    return (
        <header className="h-10 shrink-0 flex items-center justify-between px-4 border-b border-border bg-card z-30">
            {/* Logo */}
            <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-foreground tracking-tight">
                    Schema Weaver
                </span>

                {/* Nav links */}
                <nav className="flex items-center gap-0.5 ml-2">
                    <Link
                        to="/"
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                            isActive('/')
                                ? 'bg-muted text-foreground'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                        }`}
                    >
                        <Database className="w-3.5 h-3.5" />
                        Explorer
                    </Link>
                </nav>
            </div>

            {/* Right side */}
            {onOpenSettings && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={onOpenSettings}
                    title="Settings"
                >
                    <Settings className="w-4 h-4" strokeWidth={1.5} />
                    <span className="sr-only">Settings</span>
                </Button>
            )}
        </header>
    );
}
