import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export function InlineSqlBlock({ sql }: { sql: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <div className="mt-2 rounded-lg border border-border/60 bg-muted/30 overflow-hidden text-xs">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40 bg-muted/50">
                <span className="font-mono text-[10px] font-medium text-muted-foreground uppercase tracking-wider">SQL</span>
                <button
                    onClick={() => { navigator.clipboard.writeText(sql); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                    className="p-0.5 text-muted-foreground hover:text-foreground transition-colors">
                    {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                </button>
            </div>
            <pre className="px-3 py-2 overflow-x-auto text-[12px] leading-relaxed font-mono text-foreground/80 whitespace-pre-wrap">{sql}</pre>
        </div>
    );
}
