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
        <div className="w-48 border-r border-border bg-muted/30 flex flex-col h-full">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <PostgresIcon className="w-4 h-4" />
                <h2 className="text-sm font-semibold text-foreground">Connector</h2>
            </div>
            <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
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

            <div className="p-3 border-t border-border flex items-center justify-center gap-1.5">
                <PostgresIcon className="w-3 h-3 opacity-70" />
                <p className="text-[10px] text-muted-foreground text-center">
                    PostgreSQL Connector v1.0
                </p>
            </div>
        </div>
    );
}

