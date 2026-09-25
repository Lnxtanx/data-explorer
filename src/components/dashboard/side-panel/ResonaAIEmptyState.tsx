// =============================================================================
// Resona AI Side Panel — Empty State
// Gemini-style zero state with brand icon, personalized greeting, and dashboard pills.
// Dedicated exclusively to Dashboard AI.
// =============================================================================

import { useGreeting } from '../../auth/hooks/useGreeting';

interface ResonaAIEmptyStateProps {
  databaseName?: string;
  onSelectPrompt: (prompt: string) => void;
}

export function ResonaAIEmptyState({
  onSelectPrompt,
}: ResonaAIEmptyStateProps) {
  // Use existing official greeting pipeline
  const { firstName } = useGreeting();
  const cleanFirstName = (firstName || '').replace(/\.[a-zA-Z0-9_-]+/g, '').trim() || firstName;
  const greeting = cleanFirstName ? `Hi ${cleanFirstName}, I'm Resona Dashboard AI.` : "Hi, I'm Resona Dashboard AI.";

  const suggestions = [
    'What are our primary revenue drivers and growth trends?',
    'Summarize overall business health and customer retention',
    'Highlight key executive KPIs and weekly performance',
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none">
      {/* Brand Icon (Clean floating, unboxed) */}
      <div className="mb-4">
        <img
          src="/resona.png"
          alt="Resona Dashboard AI"
          className="w-9 h-9 object-contain drop-shadow-sm"
        />
      </div>

      {/* Title Greeting (Gemini style) */}
      <h2 className="text-[17px] font-medium text-foreground tracking-tight">
        {greeting}
      </h2>
      <p className="text-xs text-muted-foreground mt-1.5 max-w-[290px] leading-relaxed">
        Your dedicated live dashboard analytics &amp; visualization partner.
      </p>

      {/* Suggestion Pills (Rounded-full, centered, founder/business perspective) */}
      <div className="mt-7 flex flex-col gap-2.5 w-full items-center max-w-[340px]">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onSelectPrompt(suggestion)}
            className="w-full text-center px-4 py-2.5 rounded-full border border-border/80 bg-card hover:bg-muted/40 hover:border-border text-[13px] text-foreground/85 font-normal transition-all cursor-pointer shadow-sm leading-snug"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

