/**
 * Documentation Settings
 *
 * Simplified help and resources for Data Explorer v1.
 */

import { ExternalLink, FileText, Globe, Info, Database } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

const RESOURCES = [
    {
        label: 'General Documentation',
        description: 'Learn how to use the full Schema Weaver platform',
        icon: Globe,
        href: 'https://docs.schemaweaver.vivekmind.com',
    },
    {
        label: 'Data Explorer Guide',
        description: 'Specific guides for table browsing and data analysis',
        icon: FileText,
        href: 'https://docs.schemaweaver.vivekmind.com/data-explorer',
    },
];

export function DocumentationSettings() {
    return (
        <div className="p-8 max-w-3xl mx-auto space-y-10">
            {/* Header */}
            <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/5 flex items-center justify-center border border-primary/10 shadow-sm">
                    <img src="/resona.png" alt="Schema Weaver" className="w-9 h-9 object-contain" />
                </div>
                <div>
                    <h3 className="text-2xl font-bold text-foreground tracking-tight">Schema Weaver</h3>
                    <p className="text-muted-foreground font-medium">Data Explorer v1.0</p>
                </div>
            </div>

            {/* About Section */}
            <div className="space-y-3">
                <div className="flex items-center gap-2 text-primary">
                    <Database className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-widest">Core Product</span>
                </div>
                <p className="text-base text-muted-foreground leading-relaxed">
                    Data Explorer is a core part of the Schema Weaver ecosystem. It provides a high-performance, 
                    spreadsheet-like interface to browse, filter, and analyze your PostgreSQL data securely 
                    without writing complex SQL queries.
                </p>
            </div>

            {/* Resources Section */}
            <div className="space-y-4">
                <h4 className="text-sm font-semibold text-foreground/50 uppercase tracking-widest">Resources</h4>
                <div className="grid grid-cols-1 gap-3">
                    {RESOURCES.map((resource) => {
                        const Icon = resource.icon;
                        return (
                            <a
                                key={resource.label}
                                href={resource.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-muted/50 transition-all group border-border/50"
                            >
                                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                                    <Icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-semibold text-foreground group-hover:text-primary">
                                        {resource.label}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {resource.description}
                                    </p>
                                </div>
                                <ExternalLink className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </a>
                        );
                    })}
                </div>
            </div>

            <Separator />

            {/* Footer */}
            <div className="flex flex-col gap-1 items-center justify-center py-4">
                <div className="flex items-center gap-2 text-muted-foreground/40">
                    <Info className="w-3 h-3" />
                    <span className="text-[11px] font-bold uppercase tracking-tighter">Data Explorer Core v1.0.0</span>
                </div>
            </div>
        </div>
    );
}
