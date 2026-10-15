import { Settings, Activity, Plus, BarChart3, Heart, Server } from 'lucide-react';
import { PostgresIcon } from './DatabaseEngineIcon';
import { cn } from '@/lib/utils';

interface ConnectorSidebarProps {
    activeSection: string;
    onSelect: (section: string) => void;
}

const SECTIONS = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'connectors', label: 'Connectors', icon: Server },
    { id: 'databases', label: 'Databases', icon: PostgresIcon },
    { id: 'logs', label: 'Execution Logs', icon: Activity },
    { id: 'health', label: 'Health', icon: Heart },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'connect', label: 'Add Connector', icon: Plus },
];

export function ConnectorSidebar({ activeSection, onSelect }: ConnectorSidebarProps) {
    return (
        <div className="flex w-full shrink-0 flex-col border-b border-border bg-muted/30 md:h-full md:w-48 md:border-b-0 md:border-r">
            <div className="hidden px-4 py-3 border-b border-border items-center gap-2 md:flex">
                <PostgresIcon className="w-4 h-4" />
                <h2 className="text-sm font-semibold text-foreground">Connector</h2>
            </div>
            <nav className="flex flex-1 gap-1 overflow-x-auto p-2 md:flex-col md:overflow-y-auto md:overflow-x-hidden md:space-y-1 md:gap-0">
                {SECTIONS.map((section) => {
                    const Icon = section.icon;
                    const isActive = activeSection === section.id;

                    return (
                        <button
                            key={section.id}
                            onClick={() => onSelect(section.id)}
                            className={cn(
                                "flex w-auto shrink-0 items-center gap-2.5 whitespace-nowrap px-3 py-2 rounded-md text-sm transition-colors text-left md:w-full",
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

            <div className="hidden p-3 border-t border-border md:block">
                <p className="text-2xs text-muted-foreground text-center">
                    Connector v2.01
                </p>
            </div>
        </div>
    );
}

