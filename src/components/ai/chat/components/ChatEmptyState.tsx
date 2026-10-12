// =============================================================================
// src/components/ai/chat/components/ChatEmptyState.tsx
// Centered Hero Layout with Claude-style Contextual Greeting & suggestion chips
// =============================================================================

import React from 'react';
import { ChevronRight } from 'lucide-react';
import { ChatInput, type ChatInputProps } from '../ChatInput';

interface ChatEmptyStateProps {
    greeting: { heading: string; subtitle: string };
    chatInputProps: ChatInputProps;
    aiContextTable?: string | null;
    availableTables: string[];
    onSelectPrompt: (prompt: string) => void;
}

export const ChatEmptyState: React.FC<ChatEmptyStateProps> = ({
    greeting,
    chatInputProps,
    aiContextTable,
    availableTables,
    onSelectPrompt,
}) => {
    return (
        <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-4 py-8 select-none">
            <div className="w-full max-w-2xl flex flex-col items-center text-center -mt-4">
                {/* Resona Logo */}
                <img
                    src="/resona.png"
                    alt="Resona AI"
                    className="w-12 h-12 sm:w-14 sm:h-14 object-contain mb-3.5 select-none transition-transform duration-200 hover:scale-105"
                />

                {/* Contextual Greeting & Subtitle */}
                <h2 className="font-serif text-3xl sm:text-4xl text-foreground font-normal tracking-tight">
                    {greeting.heading}
                </h2>
                <p className="text-sm sm:text-base text-muted-foreground mt-2 font-normal">
                    {greeting.subtitle}
                </p>

                {/* Centered Input Card */}
                <div className="w-full mt-5 text-left">
                    <ChatInput
                        {...chatInputProps}
                        isEmptyState={true}
                    />
                </div>

                {/* Quick table suggestion chips */}
                {aiContextTable ? (
                    <div className="mt-4 flex flex-wrap gap-2 justify-center w-full max-w-2xl">
                        {[
                            `Describe the ${aiContextTable} table`,
                            `Show top 10 rows from ${aiContextTable}`,
                            `Any anomalies in ${aiContextTable}?`,
                        ].map(prompt => (
                            <button
                                key={prompt}
                                onClick={() => onSelectPrompt(prompt)}
                                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/70 bg-card rounded-full px-3.5 py-1.5 transition-all border border-border/60 hover:border-border shadow-sm cursor-pointer"
                            >
                                <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-50" />
                                <span>{prompt}</span>
                            </button>
                        ))}
                    </div>
                ) : availableTables.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2 justify-center w-full max-w-2xl">
                        {availableTables.slice(0, 4).map(table => (
                            <button
                                key={table}
                                onClick={() => onSelectPrompt(`Tell me about the @${table} table`)}
                                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/70 bg-card rounded-full px-3.5 py-1.5 transition-all border border-border/60 hover:border-border shadow-sm cursor-pointer"
                            >
                                <span className="font-mono text-primary text-[11px]">@{table}</span>
                                <span>overview</span>
                            </button>
                        ))}
                    </div>
                ) : null}
            </div>
        </div>
    );
};
