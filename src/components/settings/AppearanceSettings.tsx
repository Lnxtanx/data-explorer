/**
 * Appearance Settings
 *
 * Theme selection and default launch mode configuration (Data Explorer vs Resona AI).
 */

import { useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor, Check, Database, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  DEFAULT_VIEW_MODE_KEY,
  VIEW_MODE_CHANGED_EVENT,
  VIEW_MODE_LABEL,
  isViewMode,
  type ViewMode,
} from '@/lib/view-mode';

export { DEFAULT_VIEW_MODE_KEY };

const THEMES = [
    { id: 'light', label: 'Light', icon: Sun, preview: 'bg-white border-slate-200' },
    { id: 'dark', label: 'Dark', icon: Moon, preview: 'bg-[#1e1e1e] border-[#404040]' },
    { id: 'dark-black', label: 'Dark Black', icon: Moon, preview: 'bg-[#09090b] border-[#262626]' },
    { id: 'blue-gray', label: 'Blue Gray', icon: Monitor, preview: 'bg-[#0f172a] border-[#1e293b]' },
    { id: 'system', label: 'System', icon: Monitor, preview: 'bg-gradient-to-r from-white to-[#1e1e1e] border-slate-400' },
];

export function AppearanceSettings() {
    const { theme, setTheme } = useTheme();
    const [defaultMode, setDefaultMode] = useState<ViewMode>(() => {
        if (typeof window === 'undefined') return 'explorer';
        const saved = localStorage.getItem(DEFAULT_VIEW_MODE_KEY);
        return isViewMode(saved) ? saved : 'explorer';
    });

    const handleSelectDefaultMode = (mode: ViewMode) => {
        setDefaultMode(mode);
        localStorage.setItem(DEFAULT_VIEW_MODE_KEY, mode);
        window.dispatchEvent(new CustomEvent(VIEW_MODE_CHANGED_EVENT, { detail: mode }));
        toast.success(`Default mode set to ${VIEW_MODE_LABEL[mode]}`);
    };

    return (
        <div className="p-6 space-y-8">
            <div>
                <h3 className="text-lg font-semibold mb-1">Appearance</h3>
                <p className="text-xs text-muted-foreground">
                    Customize themes and configure your default workspace launch mode.
                </p>
            </div>

            {/* Section 1: Theme */}
            <div className="space-y-3">
                <div>
                    <h4 className="text-sm font-medium">Theme</h4>
                    <p className="text-xs text-muted-foreground">
                        Choose how Data Explorer looks on your device.
                    </p>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-1">
                    {THEMES.map((themeOption) => {
                        const Icon = themeOption.icon;
                        const isActive = theme === themeOption.id;

                        return (
                            <button
                                key={themeOption.id}
                                onClick={() => setTheme(themeOption.id)}
                                className={cn(
                                    "relative flex flex-col items-center p-3 rounded-lg border-2 transition-all duration-200",
                                    isActive
                                        ? "border-primary bg-primary/5 shadow-sm"
                                        : "border-border hover:border-muted-foreground/40 bg-card hover:bg-muted/20"
                                )}
                            >
                                <div className={cn(
                                    "w-full h-14 rounded-md border mb-2.5",
                                    themeOption.preview
                                )} />

                                <div className="flex items-center gap-1.5">
                                    <Icon className="w-3.5 h-3.5" />
                                    <span className="text-xs font-medium">{themeOption.label}</span>
                                </div>

                                {isActive && (
                                    <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center shadow-sm">
                                        <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={2.5} />
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Section 2: Default Mode */}
            <div className="space-y-3 pt-5 border-t border-border">
                <div>
                    <h4 className="text-sm font-medium">Default Mode</h4>
                    <p className="text-xs text-muted-foreground">
                        Select which interface opens by default.
                    </p>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-1">
                    {/* Card 1: Data Explorer */}
                    <button
                        type="button"
                        onClick={() => handleSelectDefaultMode('explorer')}
                        className={cn(
                            "relative flex items-center gap-3.5 p-3.5 rounded-xl border-2 transition-all duration-200 text-left bg-card group",
                            defaultMode === 'explorer'
                                ? "border-primary bg-primary/[0.04] shadow-sm"
                                : "border-border hover:border-muted-foreground/40 hover:bg-muted/20"
                        )}
                    >
                        <div className={cn(
                            "w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 transition-colors",
                            defaultMode === 'explorer'
                                ? "bg-primary/10 border-primary/20 text-primary"
                                : "bg-muted/60 border-border text-muted-foreground group-hover:text-foreground"
                        )}>
                            <Database className="w-4 h-4" />
                        </div>

                        <div className="flex-1 min-w-0 pr-6">
                            <span className="text-sm font-medium text-foreground">Data Explorer</span>
                        </div>

                        {defaultMode === 'explorer' && (
                            <div className="absolute top-1/2 -translate-y-1/2 right-3.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-sm">
                                <Check className="w-3 h-3 text-primary-foreground" strokeWidth={2.5} />
                            </div>
                        )}
                    </button>

                    {/* Card 2: Resona AI */}
                    <button
                        type="button"
                        onClick={() => handleSelectDefaultMode('ai')}
                        className={cn(
                            "relative flex items-center gap-3.5 p-3.5 rounded-xl border-2 transition-all duration-200 text-left bg-card group",
                            defaultMode === 'ai'
                                ? "border-primary bg-primary/[0.04] shadow-sm"
                                : "border-border hover:border-muted-foreground/40 hover:bg-muted/20"
                        )}
                    >
                        <div className={cn(
                            "w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 transition-colors overflow-hidden",
                            defaultMode === 'ai'
                                ? "bg-primary/10 border-primary/20 text-primary"
                                : "bg-muted/60 border-border text-muted-foreground group-hover:text-foreground"
                        )}>
                            <img src="/resona.png" alt="Resona AI" className="w-4 h-4 object-contain" />
                        </div>

                        <div className="flex-1 min-w-0 pr-6">
                            <span className="text-sm font-medium text-foreground">Resona AI</span>
                        </div>

                        {defaultMode === 'ai' && (
                            <div className="absolute top-1/2 -translate-y-1/2 right-3.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-sm">
                                <Check className="w-3 h-3 text-primary-foreground" strokeWidth={2.5} />
                            </div>
                        )}
                    </button>

                    {/* Card 3: Dashboard */}
                    <button
                        type="button"
                        onClick={() => handleSelectDefaultMode('dashboard')}
                        className={cn(
                            "relative flex items-center gap-3.5 p-3.5 rounded-xl border-2 transition-all duration-200 text-left bg-card group",
                            defaultMode === 'dashboard'
                                ? "border-primary bg-primary/[0.04] shadow-sm"
                                : "border-border hover:border-muted-foreground/40 hover:bg-muted/20"
                        )}
                    >
                        <div className={cn(
                            "w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 transition-colors",
                            defaultMode === 'dashboard'
                                ? "bg-primary/10 border-primary/20 text-primary"
                                : "bg-muted/60 border-border text-muted-foreground group-hover:text-foreground"
                        )}>
                            <BarChart3 className="w-4 h-4" />
                        </div>

                        <div className="flex-1 min-w-0 pr-6">
                            <span className="text-sm font-medium text-foreground">Dashboard</span>
                        </div>

                        {defaultMode === 'dashboard' && (
                            <div className="absolute top-1/2 -translate-y-1/2 right-3.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-sm">
                                <Check className="w-3 h-3 text-primary-foreground" strokeWidth={2.5} />
                            </div>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
