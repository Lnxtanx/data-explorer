/**
 * Documentation Settings
 *
 * Clean, lightweight help and resource links for Schema Weaver Data Explorer.
 * Preserves core Schema Weaver branding and tagline.
 */

import { useState } from 'react';
import { ExternalLink, Globe, FileBarChart, Server, Sparkles, Layers, Github, Copy, Check, Terminal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface ResourceItem {
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    href: string;
    badge?: string;
}

const RESOURCES: ResourceItem[] = [
    {
        label: 'Platform Documentation',
        description: 'Complete user guides, tutorials, and API reference for Schema Weaver',
        icon: Globe,
        href: 'https://docs.schemaweaver.dev',
    },
    {
        label: 'Data Explorer Guide',
        description: 'Browse tables, filter rows, analyze column stats, and export data',
        icon: FileBarChart,
        href: 'https://docs.schemaweaver.dev/data-explorer',
    },
    {
        label: 'Connector Setup & Security',
        description: 'Install, configure, and secure the on-premises PostgreSQL connector daemon',
        icon: Server,
        href: 'https://docs.schemaweaver.dev/connector',
    },
    {
        label: 'Resona AI & Voice Guide',
        description: 'Natural language queries, voice orb sessions, and automated executive dashboards',
        icon: Sparkles,
        href: 'https://docs.schemaweaver.dev/resona-ai',
    },
    {
        label: 'PostgreSQL Connector',
        description: 'Open-source on-premises daemon repository with zero-cloud-credential security',
        icon: Github,
        href: 'https://github.com/Schema-Weaver/pg-connector',
        badge: 'Open Source',
    },
    {
        label: 'SQL Editor Surface',
        description: 'Schema design, interactive ER diagrams, compiler rules, and migrations',
        icon: Layers,
        href: 'https://sql-editor.schemaweaver.dev',
    },
];

export function DocumentationSettings() {
    const [copied, setCopied] = useState(false);
    const cliCommand = 'npx @schema-weaver/pg-connector start';

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(cliCommand);
            setCopied(true);
            toast.success('Connector command copied to clipboard');
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Failed to copy to clipboard');
        }
    };

    return (
        <div className="p-6 space-y-6 max-w-3xl mx-auto">
            {/* Branding & Header */}
            <div className="space-y-4 pb-5 border-b border-border/50">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-primary/5 flex items-center justify-center border border-primary/10 shadow-xs shrink-0">
                            <img src="/resona.png" alt="Schema Weaver" className="w-8 h-8 object-contain" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-xl font-bold text-foreground tracking-tight">Schema Weaver</h3>
                                <Badge variant="outline" className="text-[11px] font-semibold tracking-wide py-0.5 px-2 bg-primary/5 text-primary border-primary/20">
                                    v2.0.0
                                </Badge>
                            </div>
                            <p className="text-muted-foreground font-medium text-xs mt-0.5">
                                The First Voice-Native Analytics Workspace for PostgreSQL
                            </p>
                        </div>
                    </div>
                    <a
                        href="https://docs.schemaweaver.dev"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border/70 bg-card hover:bg-muted transition-colors text-foreground shadow-xs shrink-0"
                    >
                        <span>Open Docs</span>
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                    </a>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                    Explore live data in high-performance grids, generate executive dashboards, ask Resona AI in plain English, or talk to your database by voice.
                </p>
            </div>

            {/* Quickstart Connector Snippet */}
            <div className="p-3.5 rounded-xl border border-border/70 bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                        <Terminal className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-foreground">PostgreSQL Connector CLI</span>
                            <Badge variant="secondary" className="text-[9px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-0">
                                Open Source
                            </Badge>
                        </div>
                        <code className="text-[11px] font-mono text-muted-foreground truncate block mt-0.5">
                            {cliCommand}
                        </code>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                    <button
                        type="button"
                        onClick={handleCopy}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-card hover:bg-accent border border-border/70 text-foreground transition-colors cursor-pointer"
                        title="Copy command"
                    >
                        {copied ? (
                            <>
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                                <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
                            </>
                        ) : (
                            <>
                                <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                                <span>Copy</span>
                            </>
                        )}
                    </button>
                    <a
                        href="https://github.com/Schema-Weaver/pg-connector"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors"
                    >
                        <Github className="w-3.5 h-3.5" />
                        <span>GitHub</span>
                    </a>
                </div>
            </div>

            {/* Guides & Reference Cards */}
            <div className="space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Guides & References</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {RESOURCES.map((resource) => {
                        const Icon = resource.icon;
                        return (
                            <a
                                key={resource.label}
                                href={resource.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group flex items-start gap-3 p-3.5 rounded-xl border border-border/60 bg-card hover:bg-muted/40 hover:border-border transition-all shadow-xs"
                            >
                                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors mt-0.5">
                                    <Icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-1.5">
                                        <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                                            {resource.label}
                                        </span>
                                        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                                            {resource.badge && (
                                                <Badge variant="outline" className="text-[9px] py-0 px-1 font-semibold text-emerald-600 dark:text-emerald-400 border-emerald-500/20 bg-emerald-500/5">
                                                    {resource.badge}
                                                </Badge>
                                            )}
                                            <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">
                                        {resource.description}
                                    </p>
                                </div>
                            </a>
                        );
                    })}
                </div>
            </div>

            {/* Clean Minimal Footer */}
            <div className="pt-4 border-t border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                    <span>Questions or feedback? Reach us at</span>
                    <a
                        href="mailto:support@schemaweaver.dev"
                        className="text-foreground hover:underline font-medium"
                    >
                        support@schemaweaver.dev
                    </a>
                </div>
                <div className="flex items-center gap-4 text-[11px]">
                    <a
                        href="https://schemaweaver.dev/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-foreground transition-colors"
                    >
                        Privacy
                    </a>
                    <a
                        href="https://schemaweaver.dev/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-foreground transition-colors"
                    >
                        Terms
                    </a>
                    <a
                        href="https://docs.schemaweaver.dev"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-foreground transition-colors"
                    >
                        Help Center
                    </a>
                </div>
            </div>
        </div>
    );
}
