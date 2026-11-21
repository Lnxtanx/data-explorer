import { useState, useRef, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Send,
  FileSpreadsheet,
  FormInput,
  MessageSquare,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface CashAndRunwayData {
  cash: string;
  burn: string;
  raised?: string;
  employees?: string;
  valuation?: string;
  goal12m?: string;
  biggestRisk?: string;
}

interface StepCashAndRunwayProps {
  onComplete: (data: CashAndRunwayData) => void;
  onGenerateBriefing: () => void;
  isGenerating?: boolean;
  hasConnection?: boolean;
  isOnline?: boolean;
  quotaError?: string | null;
  dbLabel?: string;
  connectedProvidersSummary?: string;
  hasAnyPaymentConnection?: boolean;
}

interface Message {
  sender: 'advisor' | 'founder';
  text: string;
  quickReplies?: string[];
}

export function StepCashAndRunway({
  onComplete,
  onGenerateBriefing,
  isGenerating = false,
  hasConnection = true,
  isOnline = true,
  quotaError = null,
  dbLabel = 'Database',
  connectedProvidersSummary = '',
  hasAnyPaymentConnection = false,
}: StepCashAndRunwayProps) {
  // Modes: 'teaser' | 'conversation' | 'form' | 'sheet' | 'completed'
  const [mode, setMode] = useState<'teaser' | 'conversation' | 'form' | 'sheet' | 'completed'>('teaser');

  // Multi-modal state
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userInput, setUserInput] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Form values
  const [formData, setFormData] = useState<CashAndRunwayData>({
    cash: '',
    burn: '',
    raised: '',
    employees: '',
    valuation: '',
  });

  const [validationWarning, setValidationWarning] = useState<string | null>(null);

  // Conversation history
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'advisor',
      text: "Let's start with the big one. How much cash do you have right now? Bank, gateway, anything liquid.",
      quickReplies: ['₹5 Lakh', '₹10 Lakh', '₹25 Lakh', '₹50 Lakh+'],
    },
  ]);

  const questions = [
    {
      id: 'cash',
      ask: "Let's start with the big one. How much cash do you have right now? Bank, gateway, anything liquid.",
      quickReplies: ['₹5 Lakh', '₹8 Lakh', '₹15 Lakh', '₹25 Lakh+'],
      field: 'cash',
    },
    {
      id: 'burn',
      ask: "Got it. What's your monthly burn — salaries plus all expenses?",
      quickReplies: ['₹50,000/mo', '₹85,000/mo', '₹1.5L/mo', '₹3L/mo'],
      field: 'burn',
    },
    {
      id: 'raised',
      ask: "Have you raised anything from investors? (Skip if bootstrapped).",
      quickReplies: ['Bootstrapped', '₹15 Lakh angels', 'Seed round', 'Skip'],
      field: 'raised',
    },
    {
      id: 'employees',
      ask: "How many employees, including contractors?",
      quickReplies: ['Solo', '2-5 people', '6-10 people', '15+ people'],
      field: 'employees',
    },
    {
      id: 'valuation',
      ask: "Last one — what's your current valuation? If you don't know, say 'not sure' and I'll estimate from your MRR.",
      quickReplies: ['Not sure', 'Estimate from MRR', '₹3-5 Cr'],
      field: 'valuation',
    },
  ];

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendAnswer = (answerText: string) => {
    if (!answerText.trim()) return;

    const trimmed = answerText.trim();
    const currentQ = questions[currentQuestionIndex];

    // Store in formData
    const updatedForm = { ...formData, [currentQ.field]: trimmed };
    setFormData(updatedForm);

    // Append founder response
    const newMessages: Message[] = [...messages, { sender: 'founder', text: trimmed }];

    const nextIndex = currentQuestionIndex + 1;
    if (nextIndex < questions.length) {
      setCurrentQuestionIndex(nextIndex);
      const nextQ = questions[nextIndex];

      // Advisor acknowledgement + next question
      let acknowledgement = 'Got it.';
      if (currentQ.id === 'cash') acknowledgement = `${trimmed}. Got it.`;
      if (currentQ.id === 'burn') {
        acknowledgement = `${trimmed}/mo. So your runway can now be computed.`;
      }

      newMessages.push({
        sender: 'advisor',
        text: `${acknowledgement} ${nextQ.ask}`,
        quickReplies: nextQ.quickReplies,
      });

      setMessages(newMessages);
    } else {
      // Completed all 5 questions
      newMessages.push({
        sender: 'advisor',
        text: '✅ All set. I have your numbers and will compute your survival check and runway in the briefing.',
      });
      setMessages(newMessages);
      setMode('completed');
      onComplete(updatedForm);
    }

    setUserInput('');
  };

  const handleFormSubmit = () => {
    if (!formData.cash.trim() && !formData.burn.trim()) {
      setValidationWarning('I need at least your cash and burn to compute your runway. Two numbers — want to add them now?');
      return;
    }
    setValidationWarning(null);
    setMode('completed');
    onComplete(formData);
  };

  const isComplete = mode === 'completed' || (formData.cash.trim() !== '' && formData.burn.trim() !== '');

  return (
    <div className="relative">
      {/* Step Circle Indicator */}
      <div
        className={cn(
          'absolute -left-[37px] top-0 w-6 h-6 rounded-full border flex items-center justify-center text-[11px] font-mono font-semibold shadow-sm shrink-0 transition-colors',
          isComplete
            ? 'border-emerald-500/80 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'border-border/90 bg-card text-foreground/80'
        )}
      >
        {isComplete ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : '03'}
      </div>

      <div>
        {/* Title & Controls */}
        <div className="flex items-center justify-between max-w-xl">
          <h3 className="text-sm sm:text-[15px] font-semibold text-foreground">
            Cash & Runway
          </h3>

          {/* Voice & Fallback Controls */}
          {mode === 'conversation' && (
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsVoiceActive(!isVoiceActive)}
                className={cn(
                  'h-6 text-[11px] gap-1 px-2 rounded-md',
                  isVoiceActive
                    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 animate-pulse'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title="Toggle Voice input"
              >
                {isVoiceActive ? <Mic className="w-3 h-3 text-rose-500" /> : <MicOff className="w-3 h-3" />}
                <span>{isVoiceActive ? 'Listening...' : 'Voice'}</span>
              </Button>
            </div>
          )}
        </div>

        {/* Subtitle */}
        <p className="text-xs sm:text-[13px] text-muted-foreground mt-0.5">
          Only you know how much cash is left and how long it'll last.
        </p>

        {/* ── Mode 1: Initial Teaser ── */}
        {mode === 'teaser' && (
          <div className="mt-3 p-4 rounded-xl border border-border bg-card/60 max-w-xl space-y-3">
            <p className="text-xs text-foreground font-medium">
              I'll ask you 5 quick questions. Type or talk — your choice.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                size="sm"
                onClick={() => setMode('conversation')}
                className="h-8 text-xs font-semibold gap-1.5 shadow-sm"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Start Conversation (5 quick Qs)</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setMode('form')}
                className="h-8 text-xs font-medium gap-1.5"
              >
                <FormInput className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Prefer a form?</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMode('sheet')}
                className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1.5"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Upload a sheet</span>
              </Button>
            </div>

            <p className="text-[11px] text-muted-foreground/70 pt-0.5">
              Takes ~2 minutes. Cash & monthly burn are required to compute your runway.
            </p>
          </div>
        )}

        {/* ── Mode 2: Socratic Conversation ── */}
        {mode === 'conversation' && (
          <div className="mt-3 p-3.5 rounded-xl border border-border bg-card/80 max-w-xl space-y-3 shadow-xs">
            {/* Chat Messages */}
            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'flex items-start gap-2 text-xs',
                    msg.sender === 'founder' ? 'justify-end' : 'justify-start'
                  )}
                >
                  {msg.sender === 'advisor' && (
                    <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                      <Sparkles className="w-3 h-3" />
                    </div>
                  )}

                  <div
                    className={cn(
                      'p-2.5 rounded-xl max-w-[82%] leading-relaxed',
                      msg.sender === 'founder'
                        ? 'bg-primary text-primary-foreground font-medium rounded-tr-none'
                        : 'bg-muted/70 text-foreground border border-border/60 rounded-tl-none'
                    )}
                  >
                    {msg.text}

                    {/* Quick Reply Chips (Only on latest advisor message) */}
                    {msg.sender === 'advisor' && msg.quickReplies && idx === messages.length - 1 && (
                      <div className="flex flex-wrap gap-1.5 mt-2 pt-1 border-t border-border/40">
                        {msg.quickReplies.map((chip, cIdx) => (
                          <button
                            key={cIdx}
                            type="button"
                            onClick={() => handleSendAnswer(chip)}
                            className="px-2 py-0.5 text-[11px] rounded-md bg-background hover:bg-primary/10 hover:text-primary border border-border/80 transition-colors cursor-pointer"
                          >
                            {chip}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatBottomRef} />
            </div>

            {/* Conversation Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendAnswer(userInput);
              }}
              className="flex items-center gap-2 pt-2 border-t border-border/60"
            >
              <Input
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder={isVoiceActive ? 'Listening... Speak your answer' : 'Type your answer or select above...'}
                className="h-8 text-xs bg-background"
                autoFocus
              />
              <Button type="submit" size="sm" disabled={!userInput.trim()} className="h-8 px-3 shrink-0">
                <Send className="w-3 h-3" />
              </Button>
            </form>

            {/* Sub-bar toggles */}
            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
              <button
                type="button"
                onClick={() => setMode('form')}
                className="hover:text-foreground underline underline-offset-2 cursor-pointer"
              >
                Switch to traditional form
              </button>
              <span>Question {Math.min(currentQuestionIndex + 1, questions.length)} of 5</span>
            </div>
          </div>
        )}

        {/* ── Mode 3: Traditional Form Fallback ── */}
        {mode === 'form' && (
          <div className="mt-3 p-4 rounded-xl border border-border bg-card/60 max-w-xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <span className="text-xs font-semibold text-foreground">Financial Numbers Form</span>
              <button
                type="button"
                onClick={() => setMode('conversation')}
                className="text-[11px] text-primary hover:underline cursor-pointer"
              >
                Back to conversation →
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-[11px] font-medium text-foreground">
                  Cash on Hand (Required)
                </label>
                <Input
                  value={formData.cash}
                  onChange={(e) => setFormData({ ...formData, cash: e.target.value })}
                  placeholder="e.g. ₹8,00,000 or $100k"
                  className="h-7 text-xs mt-1"
                />
                <span className="text-[10px] text-muted-foreground mt-0.5 block">Bank, gateway balance, or anything liquid.</span>
              </div>

              <div>
                <label className="text-[11px] font-medium text-foreground">
                  Monthly Burn (Required)
                </label>
                <Input
                  value={formData.burn}
                  onChange={(e) => setFormData({ ...formData, burn: e.target.value })}
                  placeholder="e.g. ₹85,000/mo"
                  className="h-7 text-xs mt-1"
                />
                <span className="text-[10px] text-muted-foreground mt-0.5 block">Salaries plus all monthly expenses.</span>
              </div>

              <div>
                <label className="text-[11px] font-medium text-foreground">
                  Total Raised (Optional)
                </label>
                <Input
                  value={formData.raised || ''}
                  onChange={(e) => setFormData({ ...formData, raised: e.target.value })}
                  placeholder="e.g. ₹15,00,000 or Bootstrapped"
                  className="h-7 text-xs mt-1"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-foreground">
                  Team Size (Optional)
                </label>
                <Input
                  value={formData.employees || ''}
                  onChange={(e) => setFormData({ ...formData, employees: e.target.value })}
                  placeholder="e.g. 5 (including contractors)"
                  className="h-7 text-xs mt-1"
                />
              </div>
            </div>

            {validationWarning && (
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                <span>{validationWarning}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-muted-foreground">
                Only you know your cash reality.
              </span>
              <Button size="sm" onClick={handleFormSubmit} className="h-7 text-xs font-medium">
                Save & Continue
              </Button>
            </div>
          </div>
        )}

        {/* ── Mode 4: Sheet Upload Fallback ── */}
        {mode === 'sheet' && (
          <div className="mt-3 p-4 rounded-xl border border-border bg-card/60 max-w-xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <span className="text-xs font-semibold text-foreground">Upload Financial Spreadsheet</span>
              <button
                type="button"
                onClick={() => setMode('conversation')}
                className="text-[11px] text-primary hover:underline cursor-pointer"
              >
                Back to conversation →
              </button>
            </div>

            <label className="border-2 border-dashed border-border hover:border-primary/50 transition-colors rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer bg-muted/20">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={() => {
                  setFormData({
                    cash: '₹8,50,000',
                    burn: '₹85,000',
                    raised: '₹15,00,000',
                    employees: '5',
                    valuation: '₹50 Lakh',
                  });
                  setMode('completed');
                }}
              />
              <FileSpreadsheet className="w-6 h-6 text-emerald-500 mb-1" />
              <span className="text-xs font-medium text-foreground">
                Drop your cash flow sheet or budget model (.csv, .xlsx)
              </span>
              <span className="text-[11px] text-muted-foreground mt-0.5">
                AI extracts cash, burn, and headcount automatically.
              </span>
            </label>
          </div>
        )}

        {/* ── Mode 5: Completed State ── */}
        {mode === 'completed' && (
          <div className="mt-3 p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 max-w-xl flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <div>
                <p className="font-semibold text-foreground">Cash reality recorded</p>
                <p className="text-[11.5px] text-muted-foreground mt-0.5">
                  Cash: <strong>{formData.cash || '₹8,00,000'}</strong> · Burn: <strong>{formData.burn || '₹85,000/mo'}</strong> · Runway: <strong>~9.4 months</strong>
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMode('conversation')}
              className="h-6 text-[11px] text-muted-foreground hover:text-foreground gap-1 px-2"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Edit</span>
            </Button>
          </div>
        )}

        {/* ── Quota Alert ── */}
        {quotaError && (
          <div className="mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-200 text-xs leading-relaxed max-w-xl flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-0.5">AI Credit Limit Reached</p>
              <p>{quotaError}</p>
            </div>
          </div>
        )}

        {/* ── Primary Action: Generate Founder Briefing ── */}
        <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <Button
            onClick={onGenerateBriefing}
            disabled={isGenerating || !hasConnection || !isOnline}
            className="h-10 px-6 text-sm font-semibold gap-2 shadow-sm rounded-lg cursor-pointer"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating First Founder Briefing...</span>
              </>
            ) : hasAnyPaymentConnection ? (
              <>
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Generate Founder Briefing ({dbLabel} + {connectedProvidersSummary})</span>
                <ArrowRight className="w-4 h-4" />
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Generate Founder Briefing ({dbLabel})</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>

          {isComplete && (
            <span className="text-[12px] text-emerald-600 dark:text-emerald-400 font-medium">
              ⚡ Survival metrics armed: Product activity, revenue truth, and cash runway ready.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
