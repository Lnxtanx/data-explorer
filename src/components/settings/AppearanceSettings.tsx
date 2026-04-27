/**
 * Appearance Settings
 *
 * Theme selection for the Data Explorer.
 * Editor-specific toggles (minimap, line numbers, etc.) are removed.
 */

import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const THEMES = [
    { id: 'light', label: 'Light', icon: Sun, preview: 'bg-white border-slate-200' },
    { id: 'dark', label: 'Dark', icon: Moon, preview: 'bg-[#1e1e1e] border-[#404040]' },
    { id: 'dark-black', label: 'Dark Black', icon: Moon, preview: 'bg-[#09090b] border-[#262626]' },
    { id: 'blue-gray', label: 'Blue Gray', icon: Monitor, preview: 'bg-[#0f172a] border-[#1e293b]' },
    { id: 'system', label: 'System', icon: Monitor, preview: 'bg-gradient-to-r from-white to-[#1e1e1e] border-slate-400' },
];

export function AppearanceSettings() {
    const { theme, setTheme } = useTheme();

    return (
        <div className="p-6">
            <h3 className="text-lg font-semibold mb-6">Appearance</h3>

            <div className="space-y-3">
                <h4 className="text-sm font-medium">Theme</h4>
                <p className="text-sm text-muted-foreground">
                    Choose how Data Explorer looks on your device.
                </p>

                <div className="grid grid-cols-3 gap-3 mt-4">
                    {THEMES.map((themeOption) => {
                        const Icon = themeOption.icon;
                        const isActive = theme === themeOption.id;

                        return (
                            <button
                                key={themeOption.id}
                                onClick={() => setTheme(themeOption.id)}
                                className={cn(
                                    "relative flex flex-col items-center p-4 rounded-lg border-2 transition-all",
                                    isActive
                                        ? "border-primary bg-primary/5"
                                        : "border-border hover:border-muted-foreground bg-card"
                                )}
                            >
                                <div className={cn(
                                    "w-full h-16 rounded-md border mb-3",
                                    themeOption.preview
                                )} />

                                <div className="flex items-center gap-2">
                                    <Icon className="w-4 h-4" />
                                    <span className="text-sm font-medium">{themeOption.label}</span>
                                </div>

                                {isActive && (
                                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                        <Check className="w-3 h-3 text-primary-foreground" />
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
