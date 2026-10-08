import { Settings, Activity, Plus, BarChart3, Heart, Server, ExternalLink } from 'lucide-react';
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

            <div className="p-3 border-t border-border flex flex-col items-center justify-center gap-1">
                <div className="flex items-center gap-1.5">
                    <PostgresIcon className="w-3 h-3 opacity-70" />
                    <span className="text-[10px] text-muted-foreground font-medium">
                        PostgreSQL Connector v2.0
                    </span>
                </div>
                <a
                    href="https://github.com/Schema-Weaver/pg-connector"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[9px] text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 opacity-80 hover:opacity-100"
                >
                    <span>Open Source</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                </a>
            </div>
        </div>
    );
}

