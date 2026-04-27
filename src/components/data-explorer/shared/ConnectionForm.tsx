
import { useState } from 'react';
import { Eye, EyeOff, Loader2, CheckCircle, AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import type { ConnectionCredentials } from '@/lib/api/data/connection';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ConnectionFormValues {
    name: string;
    host: string;
    port: string;
    database: string;
    username: string;
    password: string;
    sslMode: 'disable' | 'require' | 'verify-full';
    sslRootCert: string;
}

interface ConnectionFormProps {
    onTest: (credentials: ConnectionCredentials) => void;
    onSave: (name: string, credentials: ConnectionCredentials) => void;
    isTesting?: boolean;
    isSaving?: boolean;
    testResult?: { success: boolean; message: string } | null;
    onClearResult?: () => void;
    initialValues?: Partial<ConnectionFormValues>;
    saveLabel?: string;
}

const INITIAL_FORM: ConnectionFormValues = {
    name: '',
    host: '',
    port: '5432',
    database: '',
    username: '',
    password: '',
    sslMode: 'require',
    sslRootCert: '',
};

// ─── Component ───────────────────────────────────────────────────────────────

export function ConnectionForm({
    onTest,
    onSave,
    isTesting = false,
    isSaving = false,
    testResult,
    onClearResult,
    initialValues,
    saveLabel = 'Save',
}: ConnectionFormProps) {
    const [form, setForm] = useState<ConnectionFormValues>({ ...INITIAL_FORM, ...initialValues });
    const [showPassword, setShowPassword] = useState(false);

    const update = (field: keyof ConnectionFormValues, value: string) => {
        setForm(prev => ({ ...prev, [field]: value }));
        onClearResult?.();
    };

    const toCredentials = (): ConnectionCredentials => ({
        host: form.host,
        port: parseInt(form.port) || 5432,
        database: form.database,
        username: form.username,
        password: form.password,
        sslMode: form.sslMode,
        sslRootCert: form.sslRootCert || undefined,
    });

    const isValid = form.host && form.port && form.database && form.username && form.password;
    const isBusy = isTesting || isSaving;

    return (
        <div className="py-2 space-y-4">
            {/* Connection Name */}
            <div className="space-y-1">
                <Label htmlFor="conn-name" className="text-xs font-medium">Connection Name</Label>
                <Input id="conn-name" placeholder="My Production DB" value={form.name} onChange={e => update('name', e.target.value)} className="h-8 text-sm" />
            </div>

            {/* Host + Port */}
            <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1">
                    <Label htmlFor="conn-host" className="text-xs font-medium">Host</Label>
                    <Input id="conn-host" placeholder="db.example.com" value={form.host} onChange={e => update('host', e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="conn-port" className="text-xs font-medium">Port</Label>
                    <Input id="conn-port" placeholder="5432" value={form.port} onChange={e => update('port', e.target.value)} className="h-8 text-sm" />
                </div>
            </div>

            {/* Database */}
            <div className="space-y-1">
                <Label htmlFor="conn-db" className="text-xs font-medium">Database</Label>
                <Input id="conn-db" placeholder="postgres" value={form.database} onChange={e => update('database', e.target.value)} className="h-8 text-sm" />
            </div>

            {/* Username + Password */}
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                    <Label htmlFor="conn-user" className="text-xs font-medium">Username</Label>
                    <Input id="conn-user" placeholder="postgres" value={form.username} onChange={e => update('username', e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="conn-pass" className="text-xs font-medium">Password</Label>
                    <div className="relative">
                        <Input id="conn-pass" type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={form.password} onChange={e => update('password', e.target.value)} className="pr-8 h-8 text-sm" />
                        <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-8 w-8 hover:bg-transparent" onClick={() => setShowPassword(!showPassword)}>
                            {showPassword ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground" /> : <Eye className="h-3.5 w-3.5 text-muted-foreground" />}
                        </Button>
                    </div>
                </div>
            </div>

            {/* SSL Mode */}
            <div className="space-y-1 pt-2 border-t border-border/40">
                <Label className="text-xs font-medium">SSL Mode</Label>
                <Select value={form.sslMode} onValueChange={v => update('sslMode', v as any)}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="disable">Disable — local databases</SelectItem>
                        <SelectItem value="require">Require — cloud databases (Supabase, RDS, etc.)</SelectItem>
                        <SelectItem value="verify-full">Verify Full — strict cert validation</SelectItem>
                    </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                    {form.sslMode === 'disable' && 'Use for local PostgreSQL. Not safe for production.'}
                    {form.sslMode === 'require' && 'Encrypts traffic. Recommended for all cloud databases.'}
                    {form.sslMode === 'verify-full' && 'Validates server certificate. Requires CA cert from your provider.'}
                </p>
            </div>

            {form.sslMode === 'verify-full' && (
                <div className="space-y-1">
                    <Label className="text-xs font-medium">
                        CA Certificate <span className="text-muted-foreground/60 font-normal">(optional)</span>
                    </Label>
                    <textarea
                        value={form.sslRootCert}
                        onChange={e => update('sslRootCert', e.target.value)}
                        placeholder={`-----BEGIN CERTIFICATE-----\nPaste your CA certificate PEM here\n-----END CERTIFICATE-----`}
                        className="w-full h-24 text-xs font-mono px-3 py-2 rounded-md border border-input bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring shrink-0"
                    />
                    <p className="text-xs text-muted-foreground">
                        Download from your provider: AWS RDS → "Certificate bundle", Google Cloud SQL → "Server CA cert", Azure → "SSL certificate".
                        Leave blank to skip server identity verification.
                    </p>
                </div>
            )}

            {/* Test Result */}
            {testResult && (
                <div className={`flex items-start gap-2 p-3 rounded-md text-sm ${testResult.success ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                    {testResult.success ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                        {testResult.message.split('\n\n').map((line, i) => (
                            <p key={i} className={i > 0 ? 'mt-1 text-xs opacity-80' : ''}>{line}</p>
                        ))}
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 p-0 hover:bg-transparent flex-shrink-0" onClick={onClearResult}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            )}

            {/* Actions */}
            <div className="flex justify-between gap-3 pt-3 mt-1 border-t border-border/40 pb-1">
                <Button variant="outline" size="sm" type="button" onClick={() => onTest(toCredentials())} disabled={!isValid || isBusy} className="h-8 text-xs">
                    {isTesting ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Testing...</> : 'Test Connection'}
                </Button>
                <Button size="sm" type="button" onClick={() => onSave(form.name, toCredentials())} disabled={!isValid || !form.name.trim() || isBusy} className="bg-emerald-600 hover:bg-emerald-700 h-8 text-xs w-28">
                    {isSaving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving...</> : saveLabel}
                </Button>
            </div>
        </div>
    );
}
