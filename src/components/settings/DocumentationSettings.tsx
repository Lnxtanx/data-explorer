/**
 * Documentation Settings
 *
 * Comprehensive help and resources for Data Explorer.
 */

import { ExternalLink, Database, Globe, Sparkles, FileBarChart } from 'lucide-react';
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
        description: 'Specific guides for table browsing, analysis, and reports',
        icon: FileBarChart,
        href: 'https://docs.schemaweaver.vivekmind.com/data-explorer',
    },
];

export function DocumentationSettings() {
    const currentYear = new Date().getFullYear();

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-12">
            {/* Header & Unified Intro */}
            <div className="space-y-8">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-primary/5 flex items-center justify-center border border-primary/10 shadow-sm">
                        <img src="/resona.png" alt="Schema Weaver" className="w-9 h-9 object-contain" />
                    </div>
                    <div>
                        <h3 className="text-2xl font-bold text-foreground tracking-tight">Schema Weaver</h3>
                        <p className="text-muted-foreground font-medium text-sm">Data Explorer v1.0.0</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <p className="text-lg text-foreground font-medium leading-relaxed">
                        A high-performance interface for browsing PostgreSQL databases with <strong>smart column sizing</strong>, server-side filtering, and instant data exports.
                    </p>
                    <p className="text-base text-muted-foreground leading-relaxed">
                        Embedded within the explorer is <strong>Resona AI</strong>, a live data analysis assistant. 
                        Resona allows you to ask complex business questions in natural language and receive runnable SQL, 
                        interactive charts, and automated PowerPoint reports through an intelligent <strong>agentic workflow</strong>.
                    </p>
                </div>
            </div>

            {/* Resources Section */}
            <div className="space-y-4">
                <h4 className="text-xs font-bold text-foreground/40 uppercase tracking-[0.2em]">Resources</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {RESOURCES.map((resource) => {
                        const Icon = resource.icon;
                        return (
                            <a
                                key={resource.label}
                                href={resource.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-muted/50 transition-all group border-border/50 shadow-sm"
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

            {/* Rich Footer */}
            <div className="pt-12 mt-12 border-t border-border/50">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-8 mb-12">
                    <div className="space-y-4">
                        <h5 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Products</h5>
                        <ul className="space-y-2.5">
                            <li><a href="https://sql-editor.schemaweaver.vivekmind.com" className="text-sm text-muted-foreground hover:text-foreground transition-colors">SQL Editor</a></li>
                            <li><a href="https://data-explorer.schemaweaver.vivekmind.com" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Data Explorer</a></li>
                        </ul>
                    </div>
                    <div className="space-y-4">
                        <h5 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Resources</h5>
                        <ul className="space-y-2.5">
                            <li><a href="https://docs.schemaweaver.vivekmind.com" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Documentation</a></li>
                            <li><a href="https://schemaweaver.vivekmind.com" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Schema Weaver</a></li>
                        </ul>
                    </div>
                    <div className="space-y-4">
                        <h5 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Company</h5>
                        <ul className="space-y-2.5">
                            <li><a href="https://vivekmind.com" className="text-sm text-muted-foreground hover:text-foreground transition-colors">VivekMind</a></li>
                            <li><a href="https://vivekmind.com/contact" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Contact</a></li>
                        </ul>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pt-8 border-t border-border/30">
                    <div className="space-y-3">
                        <img src="https://vivekmind.com/vivekmind-logo.png" alt="VivekMind" className="h-4 w-auto" />
                        <p className="text-[11px] text-muted-foreground/60">
                            © {currentYear} Schema Weaver by VivekMind. All rights reserved.
                        </p>
                    </div>
                    <div className="flex items-center gap-6">
                        <a href="https://vivekmind.com/privacy" className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors">Privacy</a>
                        <a href="https://vivekmind.com/terms" className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors">Terms</a>
                        <a href="https://vivekmind.com/contact" className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors">Support</a>
                    </div>
                </div>
            </div>
        </div>
    );
}
