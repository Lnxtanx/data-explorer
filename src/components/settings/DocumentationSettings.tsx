/**
 * Documentation Settings
 *
 * Comprehensive help, architecture overview, and platform resources
 * for Schema Weaver Data Explorer v2.0.
 *
 * Tagline & documentation content synchronized with sw-docs.
 * Note: Only the PostgreSQL Connector is open source (github.com/Schema-Weaver/pg-connector).
 */

import { ExternalLink, Globe, FileBarChart, Server, Sparkles, Layers, Github, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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
        description: 'Complete architecture and user guides for the Schema Weaver ecosystem',
        icon: Globe,
        href: 'https://docs.schemaweaver.dev',
    },
    {
        label: 'Data Explorer Guide',
        description: 'Guides for live table browsing, server-side filtering, column statistics, and exports',
        icon: FileBarChart,
        href: 'https://docs.schemaweaver.dev/data-explorer',
    },
    {
        label: 'Connector Setup & Security',
        description: 'Instructions for installing, autostarting, and securing the on-premises daemon',
        icon: Server,
        href: 'https://docs.schemaweaver.dev/connector',
    },
    {
        label: 'Resona AI & Voice Guide',
        description: 'Prompting workflows, voice orb sessions, executive dashboards, and shared memory',
        icon: Sparkles,
        href: 'https://docs.schemaweaver.dev/resona-ai',
    },
    {
        label: 'PostgreSQL Connector',
        description: 'Open-source on-premises daemon repository on GitHub with zero-cloud-credential security',
        icon: Github,
        href: 'https://github.com/Schema-Weaver/pg-connector',
        badge: 'Open Source',
    },
    {
        label: 'SQL Editor Surface',
        description: 'Write PostgreSQL DDL, interactive ER diagrams, schema compiler, and safe migrations',
        icon: Layers,
        href: 'https://sql-editor.schemaweaver.dev',
    },
];

export function DocumentationSettings() {
    const currentYear = new Date().getFullYear();

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-12">
            {/* Header & Unified Intro */}
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-primary/5 flex items-center justify-center border border-primary/10 shadow-sm">
                        <img src="/resona.png" alt="Schema Weaver" className="w-9 h-9 object-contain" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2.5">
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

                <div className="space-y-3">
                    <p className="text-lg text-foreground font-semibold leading-relaxed">
                        The first voice-native analytics workspace for PostgreSQL — explore live data, ask Resona AI in plain English, or talk to your database by voice.
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Connect a database. Browse it in a high-performance grid, ask Resona AI in plain English, or talk to it by voice.
                        Two connected surfaces, sharing one account and one set of database connections:
                        <strong> Data Explorer</strong> to explore live data and generate executive dashboards, and
                        <strong> SQL Editor</strong> to design the schema behind it.
                    </p>
                </div>
            </div>

            {/* The Two Product Surfaces */}
            <div className="space-y-4">
                <h4 className="text-xs font-bold text-foreground/50 uppercase tracking-[0.2em]">Product Surfaces & Architecture</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border bg-card/60 border-border/60 shadow-sm space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
                                <FileBarChart className="w-4 h-4 text-emerald-500" />
                                <span>Data Explorer</span>
                            </div>
                            <Badge variant="secondary" className="text-[10px] uppercase font-bold tracking-wider">
                                Current Surface
                            </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            The analytics workspace. Browse tables, filter and sort live rows, inspect column statistics (null rates, distinct counts), ask Resona AI in natural language, talk to your database by voice, build dashboards, and export to CSV, Excel, JSON, SQL, or Google Sheets.
                        </p>
                    </div>

                    <div className="p-4 rounded-xl border bg-card/60 border-border/60 shadow-sm space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
                                <Layers className="w-4 h-4 text-primary" />
                                <span>SQL Editor</span>
                            </div>
                            <a
                                href="https://sql-editor.schemaweaver.dev"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <span>Open</span>
                                <ExternalLink className="w-3 h-3" />
                            </a>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Design the schema behind it. Write PostgreSQL DDL, visualize the interactive ER diagram, analyze it with the 20-layer compiler, and manage safe migrations against a live database with drift detection.
                        </p>
                    </div>

                    <div className="p-4 rounded-xl border bg-card/60 border-border/60 shadow-sm space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
                                <Sparkles className="w-4 h-4 text-amber-500" />
                                <span>Resona AI & Voice Orb</span>
                            </div>
                            <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/20">
                                4 Forms
                            </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Works in four unified forms: Chat for natural language SQL and written reports, Voice via a floating orb over every view, Dashboard AI for executive business metrics, and Shared Memory across conversations.
                        </p>
                    </div>

                    <div className="p-4 rounded-xl border bg-card/60 border-border/60 shadow-sm space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
                                <Server className="w-4 h-4 text-sky-500" />
                                <span>PostgreSQL Connector</span>
                            </div>
                            <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-semibold">
                                Open Source
                            </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Zero cloud credentials. The only open-source component of Schema Weaver — runs inside your local environment or private VPC. Talks outbound to the relay on port 443; passwords never leave your machine.
                        </p>
                    </div>
                </div>
            </div>

            {/* Quick Open Source Connector Callout */}
            <div className="p-4 rounded-xl border border-border/70 bg-muted/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-foreground text-xs font-semibold">
                        <ShieldCheck className="w-4 h-4 text-emerald-500" />
                        <span>Open Source PostgreSQL Connector CLI</span>
                        <code className="text-[11px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            @schema-weaver/pg-connector
                        </code>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Audit the code, run via <code>npx @schema-weaver/pg-connector start</code>, or inspect the open-source repository on GitHub.
                    </p>
                </div>
                <a
                    href="https://github.com/Schema-Weaver/pg-connector"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors shrink-0 shadow-sm"
                >
                    <Github className="w-3.5 h-3.5" />
                    <span>View on GitHub</span>
                    <ExternalLink className="w-3 h-3 opacity-70" />
                </a>
            </div>

            {/* Resources Section */}
            <div className="space-y-4">
                <h4 className="text-xs font-bold text-foreground/50 uppercase tracking-[0.2em]">Documentation & Resources</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {RESOURCES.map((resource) => {
                        const Icon = resource.icon;
                        return (
                            <a
                                key={resource.label}
                                href={resource.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-muted/50 transition-all group border-border/60 shadow-sm"
                            >
                                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                                    <Icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-semibold text-foreground group-hover:text-primary truncate">
                                            {resource.label}
                                        </p>
                                        {resource.badge && (
                                            <Badge variant="outline" className="text-[9px] py-0 px-1.5 font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/5">
                                                {resource.badge}
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                                        {resource.description}
                                    </p>
                                </div>
                                <ExternalLink className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                            </a>
                        );
                    })}
                </div>
            </div>

            {/* Rich Footer */}
            <div className="pt-10 mt-10 border-t border-border/50">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-8 mb-10">
                    <div className="space-y-3">
                        <h5 className="text-2xs font-bold uppercase tracking-widest text-muted-foreground/70">Products</h5>
                        <ul className="space-y-2">
                            <li><a href="https://data-explorer.schemaweaver.dev" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Data Explorer</a></li>
                            <li><a href="https://sql-editor.schemaweaver.dev" className="text-xs text-muted-foreground hover:text-foreground transition-colors">SQL Editor</a></li>
                            <li><a href="https://docs.schemaweaver.dev/connector" className="text-xs text-muted-foreground hover:text-foreground transition-colors">PostgreSQL Connector</a></li>
                        </ul>
                    </div>
                    <div className="space-y-3">
                        <h5 className="text-2xs font-bold uppercase tracking-widest text-muted-foreground/70">Resources</h5>
                        <ul className="space-y-2">
                            <li><a href="https://docs.schemaweaver.dev" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Documentation</a></li>
                            <li><a href="https://schemaweaver.dev/blog" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Release Notes & Blog</a></li>
                            <li>
                                <a
                                    href="https://github.com/Schema-Weaver/pg-connector"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                                >
                                    <span>Connector GitHub (Open Source)</span>
                                    <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                                </a>
                            </li>
                        </ul>
                    </div>
                    <div className="space-y-3">
                        <h5 className="text-2xs font-bold uppercase tracking-widest text-muted-foreground/70">Company & Support</h5>
                        <ul className="space-y-2">
                            <li><a href="https://schemaweaver.dev" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Schema Weaver</a></li>
                            <li><a href="https://schemaweaver.dev/contact" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Contact & Support</a></li>
                            <li><a href="mailto:support@schemaweaver.dev" className="text-xs text-muted-foreground hover:text-foreground transition-colors">support@schemaweaver.dev</a></li>
                        </ul>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-6 border-t border-border/30">
                    <p className="text-2xs text-muted-foreground/70">
                        © {currentYear} Schema Weaver. All rights reserved.
                    </p>
                    <div className="flex items-center gap-6">
                        <a href="https://schemaweaver.dev/privacy" className="text-2xs text-muted-foreground/70 hover:text-foreground transition-colors">Privacy Policy</a>
                        <a href="https://schemaweaver.dev/terms" className="text-2xs text-muted-foreground/70 hover:text-foreground transition-colors">Terms of Service</a>
                        <a href="https://schemaweaver.dev/contact" className="text-2xs text-muted-foreground/70 hover:text-foreground transition-colors">Support</a>
                    </div>
                </div>
            </div>
        </div>
    );
}
