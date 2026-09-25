import { useState, useEffect, useRef, useCallback } from 'react';

export type SpeechStatus = 'idle' | 'listening' | 'processing' | 'error' | 'unsupported';

interface UseSpeechToTextOptions {
    onTranscript?: (text: string, isFinal: boolean) => void;
    lang?: string;
    continuous?: boolean;
}

interface UseSpeechToTextReturn {
    status: SpeechStatus;
    isListening: boolean;
    isSupported: boolean;
    errorMessage: string | null;
    start: () => void;
    stop: () => void;
    toggle: () => void;
}

export function useSpeechToText({
    onTranscript,
    lang = 'en-US',
    continuous = false,
}: UseSpeechToTextOptions = {}): UseSpeechToTextReturn {
    const [status, setStatus] = useState<SpeechStatus>('idle');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const recognitionRef = useRef<any>(null);
    const onTranscriptRef = useRef(onTranscript);
    onTranscriptRef.current = onTranscript;

    const isSupported =
        typeof window !== 'undefined' &&
        ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

    useEffect(() => {
        if (!isSupported) {
            setStatus('unsupported');
            return;
        }

        const SpeechRecognition =
            (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

        const recognition = new SpeechRecognition();
        recognition.lang = lang;
        recognition.continuous = continuous;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
            setStatus('listening');
            setErrorMessage(null);
        };

        recognition.onresult = (event: any) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }

            if (finalTranscript) {
                setStatus('processing');
                onTranscriptRef.current?.(finalTranscript.trim(), true);
                setStatus('idle');
            } else if (interimTranscript) {
                onTranscriptRef.current?.(interimTranscript.trim(), false);
            }
        };

        recognition.onerror = (event: any) => {
            const msg =
                event.error === 'not-allowed'
                    ? 'Microphone access denied.'
                    : event.error === 'no-speech'
                    ? 'No speech detected.'
                    : `Error: ${event.error}`;
            setErrorMessage(msg);
            setStatus('error');
            setTimeout(() => setStatus('idle'), 3000);
        };

        recognition.onend = () => {
            setStatus(prev => (prev === 'listening' ? 'idle' : prev));
        };

        recognitionRef.current = recognition;

        return () => {
            recognition.abort();
        };
    }, [isSupported, lang, continuous]);

    const start = useCallback(() => {
        if (!recognitionRef.current || status === 'listening') return;
        try {
            recognitionRef.current.start();
        } catch {
            // already started — ignore
        }
    }, [status]);

    const stop = useCallback(() => {
        if (!recognitionRef.current) return;
        recognitionRef.current.stop();
        setStatus('idle');
    }, []);

    const toggle = useCallback(() => {
        if (status === 'listening') stop();
        else start();
    }, [status, start, stop]);

    return {
        status,
        isListening: status === 'listening',
        isSupported,
        errorMessage,
        start,
        stop,
        toggle,
    };
}
