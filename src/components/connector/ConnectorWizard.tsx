import { useState, useEffect } from 'react';
import {
    ClipboardPaste, AlertCircle,
    Wifi, WifiOff, Copy, RefreshCw, ArrowRight, Check, Terminal, ExternalLink
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useVerifyConnector, useConnectors } from './api/index';
import type { ConnectorVerifyResult } from './api/index';
import { DatabaseEngineIcon, PostgresIcon } from './DatabaseEngineIcon';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ConnectorWizardProps {
    onClose: () => void;
}

type Step = 'install' | 'credentials' | 'result';

const CLI_COMMANDS = [
    { step: '1', cmd: 'npm i -g @schema-weaver/pg-connector', comment: '# Install CLI globally' },
    { step: '2', cmd: 'pg-connector init', comment: '# Generate secret connector key' },
    { step: '3', cmd: 'pg-connector db add', comment: '# Attach your PostgreSQL database' },
    { step: '4', cmd: 'pg-connector start', comment: '# Launch background daemon' },
];

export function ConnectorWizard({ onClose }: ConnectorWizardProps) {
    const [step, setStep] = useState<Step>('install');
    const [connectorIdInput, setConnectorIdInput] = useState('');
    const [connectionKeyInput, setConnectionKeyInput] = useState('');
    const [result, setResult] = useState<ConnectorVerifyResult | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [copiedAll, setCopiedAll] = useState(false);
    const [copiedLine, setCopiedLine] = useState<string | null>(null);

    const verifyMutation = useVerifyConnector();
    const { data: connectors = [], refetch: refetchConnectors } = useConnectors();

    useEffect(() => {
        if (step !== 'result' || !result) return;
        const liveConnector = connectors.find((c) => c.agent_id === result.agent_id);
        if (liveConnector && liveConnector.is_online && !result.is_online) {
            setResult((prev) => prev ? {
                ...prev,
                is_online: true,
                machine_label: liveConnector.machine_label || prev.machine_label,
            } : prev);
            toast.success('PostgreSQL connector is online!');
        }
    }, [connectors, step, result]);

    const handleRefreshStatus = async () => {
        setIsRefreshing(true);
        try {
            const { data: updatedConnectors } = await refetchConnectors();
            if (result && updatedConnectors) {
                const found = updatedConnectors.find((c) => c.agent_id === result.agent_id);
                if (found) {
                    setResult((prev) => prev ? {
                        ...prev,
                        is_online: Boolean(found.is_online),
                        machine_label: found.machine_label || prev.machine_label,
                    } : prev);

                    if (found.is_online) {
                        toast.success('PostgreSQL connector is now Online!');
                    } else {
                        toast.info('Connector daemon is not running yet. Run "pg-connector start" in your terminal.');
                    }
                }
            }
        } catch {
            toast.error('Failed to check daemon status');
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleCopyAll = () => {
        const fullScript = CLI_COMMANDS.map(c => c.cmd).join('\n');
        navigator.clipboard.writeText(fullScript);
        setCopiedAll(true);
        toast.success('Copied all setup commands');
        setTimeout(() => setCopiedAll(false), 2000);
    };

    const handleCopySingle = (cmd: string, id: string) => {
        navigator.clipboard.writeText(cmd);
        setCopiedLine(id);
        toast.success(`Copied: ${cmd}`);
        setTimeout(() => setCopiedLine(null), 2000);
    };


    const handleVerify = async () => {
        const trimmedKey = connectionKeyInput.trim();
        const trimmedId = connectorIdInput.trim();

        if (!trimmedId || !trimmedId.startsWith('agt_')) {
            toast.error('Enter a valid Connector ID starting with agt_');
            return;
        }

        if (!trimmedKey || !trimmedKey.startsWith('swagt_')) {
            toast.error('Enter a valid Connection Key starting with swagt_');
            return;
        }

        try {
            const res = await verifyMutation.mutateAsync({
                connectionKey: trimmedKey,
                connectorId: trimmedId,
            });
            setResult(res);
            setStep('result');

            if (res.is_online) {
                toast.success('PostgreSQL connector connected!');
            }
        } catch (err: any) {
            toast.error(err?.message || 'Failed to verify connector');
        }
    };

    return (
        <div className="p-6 space-y-5 flex flex-col h-full overflow-y-auto justify-between">
            {/* ── Header ── */}
            <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b">
                    <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="w-6 h-6 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center p-0.5 shrink-0">
                                <PostgresIcon className="w-4 h-4" />
                            </div>
                            <h3 className="text-lg font-semibold tracking-tight text-foreground">
                                Connect PostgreSQL Database
                            </h3>
                            <a
                                href="https://github.com/Schema-Weaver/pg-connector"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground bg-muted/60 hover:bg-muted border border-border/70 transition-all hover:border-border cursor-pointer shadow-sm"
                                title="Open pg-connector GitHub repository (Open Source)"
                            >
                                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                                </svg>
                                <span>Open Source</span>
                                <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                            </a>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Connect your local or VPC database via outbound connector without exposing credentials to the cloud.
                        </p>
                    </div>
                </div>

                {/* ── Modern Stepper ── */}
                <WizardStepper step={step} />
            </div>

            {/* ─── STEP 1: COMPACT DEVELOPER TERMINAL ─── */}
            {step === 'install' && (
                <div className="space-y-4 flex-1 flex flex-col justify-between py-1">
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">
                                Run these commands in your terminal where PostgreSQL is running:
                            </p>
                            <span className="text-[10px] text-muted-foreground font-mono">
                                Node.js 18+ required
                            </span>
                        </div>

                        {/* Clean Theme-Aware Commands Block */}
                        <div className="rounded-xl border border-border/70 bg-card shadow-sm overflow-hidden">
                            {/* Commands Top Bar */}
                            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border/60 bg-muted/30">
                                <div className="flex items-center gap-2">
                                    <Terminal className="w-4 h-4 text-primary" />
                                    <span className="text-xs font-semibold text-foreground">
                                        Terminal Setup Commands
                                    </span>
                                </div>
                                <button
                                    onClick={handleCopyAll}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-foreground bg-background hover:bg-muted border border-border/70 transition-colors shadow-sm cursor-pointer"
                                    title="Copy all 4 commands"
                                >
                                    {copiedAll ? (
                                        <>
                                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Copied All</span>
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                                            <span>Copy All</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            {/* Commands List */}
                            <div className="p-3 space-y-1.5 font-mono text-xs">
                                {CLI_COMMANDS.map((item) => (
                                    <div
                                        key={item.step}
                                        className="flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg hover:bg-muted/50 transition-colors group"
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <span className="text-muted-foreground/60 select-none">$</span>
                                            <span className="font-medium text-foreground select-all truncate">
                                                {item.cmd}
                                            </span>
                                            <span className="text-muted-foreground text-[11px] font-normal select-none hidden sm:inline truncate">
                                                {item.comment}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => handleCopySingle(item.cmd, item.step)}
                                            className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted transition-all shrink-0 cursor-pointer"
                                            title="Copy command"
                                        >
                                            {copiedLine === item.step ? (
                                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                                            ) : (
                                                <Copy className="w-3.5 h-3.5" />
                                            )}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <Button
                        onClick={() => setStep('credentials')}
                        className="w-full h-9.5 text-xs font-medium rounded-xl gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
                    >
                        <span>I have my Connector ID &amp; Key</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                </div>
            )}

            {/* ─── STEP 2: CREDENTIALS ─── */}
            {step === 'credentials' && (
                <div className="space-y-4 flex-1 flex flex-col justify-between py-1">
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <h4 className="text-sm font-semibold text-foreground">Paste Connector Credentials</h4>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Paste the values generated by <code className="px-1.5 py-0.5 rounded bg-muted/60 font-mono text-[11px] text-muted-foreground font-medium">pg-connector init</code>, or run <code className="px-1.5 py-0.5 rounded bg-muted/60 font-mono text-[11px] text-muted-foreground font-medium">pg-connector config --token</code> to see your config data.
                            </p>
                        </div>

                        <div className="space-y-3.5">
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                                    <span>Connector ID</span>
                                    <span className="text-[10px] text-muted-foreground/70 font-mono">Starts with agt_</span>
                                </label>
                                <div className="relative">
                                    <Terminal className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input
                                        value={connectorIdInput}
                                        onChange={(e) => setConnectorIdInput(e.target.value)}
                                        placeholder="agt_vivek-laptop-msi_12662b69"
                                        className="pl-9 font-mono text-xs h-9.5 rounded-xl border-border/80"
                                        autoFocus
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                                    <span>Connection Key</span>
                                    <span className="text-[10px] text-muted-foreground/70 font-mono">Starts with swagt_</span>
                                </label>
                                <div className="relative">
                                    <ClipboardPaste className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input
                                        value={connectionKeyInput}
                                        onChange={(e) => setConnectionKeyInput(e.target.value)}
                                        placeholder="swagt_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                                        className="pl-9 font-mono text-xs h-9.5 rounded-xl border-border/80"
                                        onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                                    />
                                </div>
                            </div>

                            {verifyMutation.isError && (
                                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-destructive/10 text-xs text-destructive border border-destructive/20">
                                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <span>{(verifyMutation.error as any)?.message || 'Verification failed'}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex gap-2.5 pt-2">
                        <Button variant="outline" onClick={() => setStep('install')} className="h-9.5 text-xs rounded-xl px-4 font-medium">
                            Back
                        </Button>
                        <Button
                            onClick={handleVerify}
                            disabled={verifyMutation.isPending || !connectionKeyInput.trim() || !connectorIdInput.trim()}
                            className="flex-1 h-9.5 text-xs font-medium rounded-xl gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
                        >
                            {verifyMutation.isPending ? 'Verifying...' : 'Verify & Connect'}
                        </Button>
                    </div>
                </div>
            )}

            {/* ─── STEP 3: RESULT ─── */}
            {step === 'result' && result && (
                <div className="space-y-4 flex-1 flex flex-col justify-between py-1">
                    <div className="space-y-3.5">
                        <div className="border rounded-2xl bg-card p-4 space-y-3.5 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        'w-10 h-10 rounded-xl flex items-center justify-center border shrink-0',
                                        result.is_online
                                            ? 'bg-emerald-500/10 border-emerald-500/25'
                                            : 'bg-amber-500/10 border-amber-500/25'
                                    )}>
                                        <DatabaseEngineIcon
                                            engine="postgres"
                                            className="w-5 h-5"
                                            isOnline={result.is_online}
                                            showStatusDot={true}
                                        />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">
                                            {result.machine_label || 'Local Agent Host'}
                                        </p>
                                        <p className="text-[11px] text-muted-foreground font-mono">
                                            {result.agent_id}
                                        </p>
                                    </div>
                                </div>
                                <Badge
                                    variant="outline"
                                    className={cn(
                                        'text-xs font-medium px-2.5 py-1 rounded-full',
                                        result.is_online
                                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
                                            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25'
                                    )}
                                >
                                    {result.is_online ? (
                                        <><Wifi className="w-3 h-3 mr-1 text-emerald-500" /> Online</>
                                    ) : (
                                        <><WifiOff className="w-3 h-3 mr-1 text-amber-500" /> Offline</>
                                    )}
                                </Badge>
                            </div>

                            {/* Discovered DBs */}
                            {result.databases && result.databases.length > 0 && (
                                <div className="space-y-2 pt-2 border-t text-xs">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                            Discovered Databases ({result.databases.length})
                                        </p>
                                    </div>
                                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                                        {result.databases.map((db) => (
                                            <div key={db.db_alias} className="flex items-center justify-between px-3 py-2 rounded-xl bg-muted/40 border border-border/50 hover:bg-muted/70 transition-colors">
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <DatabaseEngineIcon
                                                        engine="postgres"
                                                        className="w-4 h-4"
                                                        isOnline={result.is_online}
                                                        showStatusDot={true}
                                                    />
                                                    <span className="font-medium text-foreground truncate text-xs">{db.database}</span>
                                                </div>
                                                {db.version && (
                                                    <span className="text-[10px] text-muted-foreground font-mono px-1.5 py-0.5 rounded bg-background border">
                                                        {db.version}
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {!result.is_online && (
                            <div className="border rounded-xl border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10 p-3.5 space-y-3 shadow-sm">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                                            <WifiOff className="w-3.5 h-3.5" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold text-foreground">
                                                Connector Daemon is Offline
                                            </p>
                                            <p className="text-[11px] text-muted-foreground">
                                                Run the daemon locally to activate live connection
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 px-3 text-xs rounded-lg font-medium border-border hover:bg-background text-foreground gap-1.5 shadow-sm shrink-0 cursor-pointer"
                                        onClick={handleRefreshStatus}
                                        disabled={isRefreshing}
                                    >
                                        <RefreshCw className={cn("w-3 h-3 text-muted-foreground", isRefreshing && "animate-spin text-primary")} />
                                        <span>{isRefreshing ? 'Checking...' : 'Refresh Status'}</span>
                                    </Button>
                                </div>

                                <SimpleCommandRow command="pg-connector start" />
                            </div>
                        )}
                    </div>

                    <Button onClick={onClose} className="w-full h-9.5 text-xs font-medium rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm">
                        Done &amp; Start Exploring
                    </Button>
                </div>
            )}
        </div>
    );
}

// ─── Modern Stepper Component ───────────────────────────────────────────────

function WizardStepper({ step }: { step: Step }) {
    const steps = [
        { id: 'install', label: '1. Setup CLI' },
        { id: 'credentials', label: '2. Register Key' },
        { id: 'result', label: '3. Connected' },
    ];

    const getStatus = (id: string) => {
        if (step === id) return 'active';
        if (step === 'result') return 'completed';
        if (step === 'credentials' && id === 'install') return 'completed';
        return 'upcoming';
    };

    return (
        <div className="flex items-center justify-between gap-2">
            {steps.map((s, idx) => {
                const status = getStatus(s.id);
                return (
                    <div key={s.id} className="flex items-center gap-2 flex-1 last:flex-none">
                        <div className={cn(
                            "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all duration-200",
                            status === 'active' && "bg-primary/10 text-primary border border-primary/25 font-semibold",
                            status === 'completed' && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25",
                            status === 'upcoming' && "text-muted-foreground bg-muted/40"
                        )}>
                            {status === 'completed' ? (
                                <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                                <span className={cn(
                                    "w-1.5 h-1.5 rounded-full",
                                    status === 'active' ? "bg-primary animate-pulse" : "bg-muted-foreground/40"
                                )} />
                            )}
                            <span>{s.label}</span>
                        </div>
                        {idx < steps.length - 1 && (
                            <div className={cn(
                                "flex-1 h-px transition-colors",
                                status === 'completed' ? "bg-emerald-500/40" : "bg-border/60"
                            )} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ─── Single Command Helper ──────────────────────────────────────────────────

function SimpleCommandRow({ command }: { command: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(command);
        setCopied(true);
        toast.success('Copied command');
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg bg-background border border-border/70 text-foreground font-mono text-xs shadow-sm">
            <div className="flex items-center gap-2 min-w-0">
                <span className="text-muted-foreground/60 select-none">$</span>
                <span className="font-medium text-foreground select-all truncate">{command}</span>
            </div>
            <button
                onClick={handleCopy}
                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted shrink-0 cursor-pointer"
                title="Copy command"
            >
                {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500 animate-in zoom-in-50 duration-200" />
                ) : (
                    <Copy className="w-3.5 h-3.5" />
                )}
            </button>
        </div>
    );
}
