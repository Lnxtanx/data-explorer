/**
 * Settings Sidebar
 *
 * Navigation sidebar for the settings modal.
 * Trimmed for Data Explorer — project and collaboration sections removed.
 */

import type { ElementType } from 'react';
import { User, CreditCard, Palette, Keyboard, BookOpen, Users, BarChart3, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SettingsSection } from './types';

interface SettingsSidebarProps {
    activeSection: SettingsSection;
    onSelect: (section: SettingsSection) => void;
    user?: any;
}

const SECTIONS: { id: SettingsSection; label: string; icon: ElementType }[] = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'usage', label: 'Usage', icon: BarChart3 },
    { id: 'plans', label: 'Plans & Billing', icon: CreditCard },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: Keyboard },
    { id: 'collaboration', label: 'Collaboration', icon: Users },
    { id: 'documentation', label: 'Documentation', icon: BookOpen },
    { id: 'feedback', label: 'Feedback & Support', icon: MessageSquare },
];

export function SettingsSidebar({ activeSection, onSelect }: SettingsSidebarProps) {
    return (
        <div className="w-48 border-r border-border bg-muted/30 flex flex-col">
            <div className="px-4 py-3 border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">Settings</h2>
            </div>

            <nav className="flex-1 p-2 space-y-1">
                {SECTIONS.map((section) => {
                    const Icon = section.icon;
                    const isActive = activeSection === section.id;

                    return (
                        <button
                            key={section.id}
                            onClick={() => onSelect(section.id)}
                            className={cn(
                                "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left",
                                isActive
                                    ? "bg-primary/10 text-primary font-medium"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                        >
                            <Icon className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">{section.label}</span>
                        </button>
                    );
                })}
            </nav>

            <div className="p-3 border-t border-border">
                <p className="text-[10px] text-muted-foreground text-center">
                    Data Explorer v1.0
                </p>
            </div>
        </div>
    );
}
