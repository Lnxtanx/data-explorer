// =============================================================================
// Table AI Chat Panel - Slide-over panel for AI chat about a specific table
// =============================================================================

import { useState, useRef, useEffect } from 'react';
import { X, Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface TableAIChatPanelProps {
  tableName: string;
  schemaName: string;
  onClose: () => void;
}

export function TableAIChatPanel({ tableName, schemaName, onClose }: TableAIChatPanelProps) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSend = () => {
    if (!input.trim() || isTyping) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = '40px';
    }

    // Mock AI response
    setTimeout(() => {
      setIsTyping(false);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `I'll analyze the \`${schemaName}.${tableName}\` table for you. This is a mock response — the AI pipeline is coming soon!`,
      }]);
    }, 1200);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (e.target) {
      e.target.style.height = '40px';
      e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-[420px] max-w-full h-full bg-background border-l border-border flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between h-11 px-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <img src="/resona.png" alt="Resona" className="w-4 h-4" />
            <span className="text-sm font-medium">Resona AI</span>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Table reference tag */}
        <div className="px-4 py-2 border-b border-border/50 bg-muted/30">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Context:</span>
            <span className="inline-flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[11px] font-medium">
              @{schemaName}.{tableName}
            </span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-12 h-12 rounded-2xl bg-primary/5 flex items-center justify-center mb-3">
                <Sparkles className="w-6 h-6 text-primary/40" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">Ask about {tableName}</p>
              <p className="text-xs text-muted-foreground max-w-[250px]">
                Ask questions, generate queries, or get insights about this table.
              </p>
              {/* Quick prompts */}
              <div className="flex flex-col gap-1.5 mt-4 w-full max-w-[280px]">
                {[
                  `Describe the ${tableName} table`,
                  `Show me a query to get all rows`,
                  `What indexes should I add?`,
                ].map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(prompt); textareaRef.current?.focus(); }}
                    className="text-left text-xs text-muted-foreground hover:text-foreground hover:bg-muted px-3 py-2 rounded-lg border border-border/50 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {messages.map(msg => (
                <div key={msg.id} className={cn('flex gap-2.5', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                      <img src="/resona.png" alt="AI" className="w-3.5 h-3.5" />
                    </div>
                  )}
                  <div className={cn(
                    'text-[13px] px-3 py-2 rounded-2xl max-w-[85%] whitespace-pre-wrap leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  )}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <img src="/resona.png" alt="AI" className="w-3.5 h-3.5" />
                  </div>
                  <div className="bg-muted text-foreground px-3 py-2 rounded-2xl">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-border p-3 shrink-0">
          <div className="relative flex items-end gap-2 bg-muted/50 rounded-xl border border-border/50 px-3 py-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder={`Ask about ${tableName}...`}
              className="flex-1 bg-transparent text-sm resize-none outline-none min-h-[40px] max-h-[160px] py-1 placeholder:text-muted-foreground/50"
              rows={1}
            />
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-8 w-8 shrink-0 rounded-lg transition-colors',
                input.trim() ? 'text-primary hover:bg-primary/10' : 'text-muted-foreground/30'
              )}
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
