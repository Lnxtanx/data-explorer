import { useState, useEffect } from 'react';
import {
    ClipboardPaste, CheckCircle2, AlertCircle,
    Wifi, WifiOff, Copy, RefreshCw, ArrowRight, Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useVerifyConnector, useConnectors } from '@/lib/api/connector';
import type { ConnectorVerifyResult } from '@/lib/api/connector';
import { DatabaseEngineIcon, PostgresIcon } from '@/components/data-explorer/shared/DatabaseEngineIcon';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ConnectorWizardProps {
    onClose: () => void;
}

type Step = 'install' | 'credentials' | 'result';

export function ConnectorWizard({ onClose }: ConnectorWizardProps) {
    const [step, setStep] = useState<Step>('install');
    const [connectorIdInput, setConnectorIdInput] = useState('');
    const [connectionKeyInput, setConnectionKeyInput] = useState('');
    const [result, setResult] = useState<ConnectorVerifyResult | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
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

    const handleSmartPaste = (value: string, target: 'id' | 'key') => {
        const trimmed = value.trim();
        const idMatch = trimmed.match(/agt_[a-zA-Z0-9_-]+/);
        const keyMatch = trimmed.match(/swagt_[a-zA-Z0-9_-]+/);

        if (idMatch && keyMatch) {
            setConnectorIdInput(idMatch[0]);
            setConnectionKeyInput(keyMatch[0]);
            toast.success('Pasted ID and Key');
            return;
        }

        if (target === 'id') {
            setConnectorIdInput(trimmed);
        } else {
            setConnectionKeyInput(trimmed);
        }
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
                toast.success('PostgreSQL proxy connected!');
            }
        } catch (err: any) {
            toast.error(err?.message || 'Failed to verify connector');
        }
    };

    return (
        <div className="p-6 space-y-6 flex flex-col h-full overflow-y-auto">
            {/* Clean Header */}
            <div className="pb-2 border-b">
                <div className="flex items-center gap-2">
                    <PostgresIcon className="w-5 h-5" />
                    <h3 className="text-xl font-semibold tracking-tight text-foreground">
                        Connect PostgreSQL Database
                    </h3>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Connect your local or VPC database via outbound proxy daemon without exposing credentials to the cloud.
                </p>
            </div>

            {/* Clean Stepper */}
            <div className="flex items-center gap-2 text-xs font-medium px-1">
                <StepDot active={step === 'install'} completed={step !== 'install'} label="1. Setup CLI" />
                <div className="flex-1 h-px bg-border" />
                <StepDot active={step === 'credentials'} completed={step === 'result'} label="2. Register Key" />
                <div className="flex-1 h-px bg-border" />
                <StepDot active={step === 'result'} completed={false} label="3. Connected" />
            </div>

            {/* ─── STEP 1: MINIMAL CLEAN SETUP ─── */}
            {step === 'install' && (
                <div className="space-y-5 flex-1 flex flex-col justify-between">
                    <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                            Run these commands on your terminal where PostgreSQL is running:
                        </p>

                        <div className="space-y-2.5">
                            <SetupStepRow
                                stepNumber="1"
                                label="Install CLI"
                                command="npm i -g @vivekmind/pg-connector"
                            />
                            <SetupStepRow
                                stepNumber="2"
                                label="Initialize & Copy Key"
                                command="pg-connector init"
                            />
                            <SetupStepRow
                                stepNumber="3"
                                label="Add Database"
                                command="pg-connector db add"
                            />
                            <SetupStepRow
                                stepNumber="4"
                                label="Start Daemon"
                                command="pg-connector start"
                            />
                        </div>
                    </div>

                    <Button
                        onClick={() => setStep('credentials')}
                        className="w-full h-10 text-xs font-medium rounded-xl gap-1.5"
                    >
                        <span>I have my Connector ID & Key</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                </div>
            )}

            {/* ─── STEP 2: CREDENTIALS ─── */}
            {step === 'credentials' && (
                <div className="space-y-5 flex-1 flex flex-col justify-between">
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <h4 className="text-sm font-semibold text-foreground">Paste Connector Credentials</h4>
                            <p className="text-xs text-muted-foreground">
                                Copy the values outputted by <code className="px-1 py-0.5 bg-muted rounded font-mono text-[11px]">pg-connector init</code> or <code className="px-1 py-0.5 bg-muted rounded font-mono text-[11px]">pg-connector config --token</code>.
                            </p>
                        </div>

                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-muted-foreground">
                                    Connector ID
                                </label>
                                <div className="relative">
                                    <PostgresIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" />
                                    <Input
                                        value={connectorIdInput}
                                        onChange={(e) => handleSmartPaste(e.target.value, 'id')}
                                        placeholder="agt_vivek-laptop-msi_12662b69"
                                        className="pl-9 font-mono text-xs h-9 rounded-lg"
                                        autoFocus
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-muted-foreground">
                                    Connection Key
                                </label>
                                <div className="relative">
                                    <ClipboardPaste className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input
                                        value={connectionKeyInput}
                                        onChange={(e) => handleSmartPaste(e.target.value, 'key')}
                                        placeholder="swagt_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                                        className="pl-9 font-mono text-xs h-9 rounded-lg"
                                        onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                                    />
                                </div>
                            </div>

                            {verifyMutation.isError && (
                                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 text-xs text-destructive border border-destructive/20">
                                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <span>{(verifyMutation.error as any)?.message || 'Verification failed'}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex gap-2.5">
                        <Button variant="outline" onClick={() => setStep('install')} className="h-10 text-xs rounded-xl px-4">
                            Back
                        </Button>
                        <Button
                            onClick={handleVerify}
                            disabled={verifyMutation.isPending || !connectionKeyInput.trim() || !connectorIdInput.trim()}
                            className="flex-1 h-10 text-xs font-medium rounded-xl gap-1.5"
                        >
                            {verifyMutation.isPending ? 'Verifying...' : 'Verify & Connect'}
                        </Button>
                    </div>
                </div>
            )}

            {/* ─── STEP 3: RESULT ─── */}
            {step === 'result' && result && (
                <div className="space-y-5 flex-1 flex flex-col justify-between">
                    <div className="space-y-4">
                        <div className="border rounded-xl bg-background p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        'w-9 h-9 rounded-lg flex items-center justify-center border shrink-0',
                                        result.is_online
                                            ? 'bg-emerald-500/10 border-emerald-500/20'
                                            : 'bg-amber-500/10 border-amber-500/20'
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
                                        'text-xs font-medium px-2.5 py-0.5',
                                        result.is_online
                                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                    )}
                                >
                                    {result.is_online ? (
                                        <><Wifi className="w-3 h-3 mr-1" /> Online</>
                                    ) : (
                                        <><WifiOff className="w-3 h-3 mr-1" /> Offline</>
                                    )}
                                </Badge>
                            </div>

                            {/* Discovered DBs */}
                            {result.databases && result.databases.length > 0 && (
                                <div className="space-y-1.5 pt-2 border-t text-xs">
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                        Discovered Databases
                                    </p>
                                    <div className="space-y-1">
                                        {result.databases.map((db) => (
                                            <div key={db.db_alias} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-muted/40">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <DatabaseEngineIcon
                                                        engine="postgres"
                                                        className="w-3.5 h-3.5"
                                                        isOnline={result.is_online}
                                                        showStatusDot={true}
                                                    />
                                                    <span className="font-medium text-foreground truncate">{db.database}</span>
                                                </div>
                                                {db.version && <span className="text-[10px] text-muted-foreground font-mono">{db.version}</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {!result.is_online && (
                            <div className="border rounded-xl bg-amber-500/10 border-amber-500/20 p-3.5 space-y-2">
                                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                                    Run in your terminal to go online:
                                </p>
                                <SimpleCommandRow command="pg-connector start" />
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full h-8 text-xs mt-1 rounded-lg font-medium"
                                    onClick={handleRefreshStatus}
                                    disabled={isRefreshing}
                                >
                                    <RefreshCw className={cn("w-3 h-3 mr-1.5", isRefreshing && "animate-spin")} />
                                    {isRefreshing ? 'Checking...' : 'Refresh Status Now'}
                                </Button>
                            </div>
                        )}
                    </div>

                    <Button onClick={onClose} className="w-full h-10 text-xs font-medium rounded-xl">
                        Done
                    </Button>
                </div>
            )}
        </div>
    );
}

function StepDot({
    active,
    completed,
    label,
}: {
    active: boolean;
    completed: boolean;
    label: string;
}) {
    return (
        <div className="flex items-center gap-1.5">
            <div
                className={cn(
                    'w-2 h-2 rounded-full transition-colors',
                    active
                        ? 'bg-primary'
                        : completed
                        ? 'bg-emerald-500'
                        : 'bg-muted-foreground/30'
                )}
            />
            <span
                className={cn(
                    'text-xs transition-colors',
                    active ? 'text-foreground font-semibold' : 'text-muted-foreground'
                )}
            >
                {label}
            </span>
        </div>
    );
}

function SetupStepRow({
    stepNumber,
    label,
    command,
}: {
    stepNumber: string;
    label: string;
    command: string;
}) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(command);
        setCopied(true);
        toast.success(`Copied: ${command}`);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="px-3.5 py-2.5 rounded-xl border border-border bg-card/40 hover:bg-muted/20 transition-colors space-y-1.5">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[10px] font-medium shrink-0">
                        {stepNumber}
                    </span>
                    <span className="text-xs font-medium text-foreground">
                        {label}
                    </span>
                </div>
            </div>
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-muted/60 dark:bg-muted/30 border border-border/80 text-xs font-mono text-foreground/90">
                <code className="truncate select-all flex-1">
                    {command}
                </code>
                <button
                    onClick={handleCopy}
                    className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-background shrink-0"
                    title="Copy command"
                >
                    {copied ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500 animate-in zoom-in-50 duration-200" />
                    ) : (
                        <Copy className="w-3.5 h-3.5" />
                    )}
                </button>
            </div>
        </div>
    );
}

function SimpleCommandRow({ command }: { command: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(command);
        setCopied(true);
        toast.success('Copied command');
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-muted/60 dark:bg-muted/30 border border-border/80 text-foreground font-mono text-xs">
            <code className="select-all flex-1 truncate">{command}</code>
            <button
                onClick={handleCopy}
                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-background shrink-0"
                title="Copy"
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
