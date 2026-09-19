// =============================================================================
// Empty State - Professional placeholder with helpful guidance & optimized looping video
// =============================================================================

import { useState, useRef, useEffect } from 'react';
import { Table2, ArrowLeft, Plus, Terminal, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface EmptyStateProps {
  hasConnection: boolean;
  onOpenConnectWizard?: () => void;
}

const VIDEOS = [
  {
    id: 'cinematic',
    label: 'Terminal Flow',
    src: '/pg_connector_cinematic.mp4',
  },
  {
    id: 'flow',
    label: 'Architecture Flow',
    src: '/pg_connector_flow.mp4',
  },
];

export function EmptyState({ hasConnection, onOpenConnectWizard }: EmptyStateProps) {
  const [selectedVideo, setSelectedVideo] = useState(VIDEOS[0].src);
  const [copied, setCopied] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Guarantee seamless video playback, zero sound, and hardware acceleration
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Hard enforcement of muted audio (zero sound guarantee)
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Safe autoplay catch permitted by all major browsers
      });
    }

    return () => {
      // Free GPU and video decoder memory when user navigates away or connects
      video.pause();
    };
  }, [selectedVideo]);

  const handleCopy = (command: string) => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-start p-6 pt-5 sm:pt-7 pb-16 overflow-y-auto">
      {!hasConnection ? (
        <div className="w-full max-w-xl text-center space-y-4">
          {/* ─── Unified Hero Card with Video & Actions ─── */}
          <div className="rounded-2xl border border-border/70 bg-card/70 p-2 shadow-lg backdrop-blur-xs overflow-hidden text-left">
            {/* Video Player Container */}
            <div 
              className="relative aspect-[16/9] w-full rounded-xl overflow-hidden bg-muted/40 border border-border/40 shadow-xs select-none"
              onContextMenu={(e) => e.preventDefault()}
            >
              {/* Active Playing Video */}
              <video
                ref={videoRef}
                key={selectedVideo}
                src={selectedVideo}
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                controls={false}
                disablePictureInPicture
                disableRemotePlayback
                onEnded={() => {
                  // Fallback to guarantee infinite loop if browser loop flag hiccups
                  videoRef.current?.play().catch(() => {});
                }}
                className="w-full h-full object-cover pointer-events-none select-none transform-gpu will-change-transform"
              />

              {/* Background Preload for the Inactive Video (ensures 0ms instant tab switching) */}
              {VIDEOS.filter((v) => v.src !== selectedVideo).map((inactive) => (
                <video
                  key={inactive.id}
                  src={inactive.src}
                  preload="auto"
                  muted
                  className="hidden"
                  aria-hidden="true"
                />
              ))}
            </div>

            {/* Sub-bar with video switcher tabs */}
            <div className="flex items-center justify-between px-2 pt-2.5 pb-1">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground select-none">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Architecture Preview</span>
              </div>
              <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border border-border/40">
                {VIDEOS.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVideo(v.src)}
                    className={cn(
                      "px-2.5 py-0.5 rounded-md text-[10px] font-medium transition-all duration-150 cursor-pointer",
                      selectedVideo === v.src
                        ? "bg-background text-foreground shadow-xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="my-2 border-t border-border/50" />

            {/* Action & Info Area */}
            <div className="p-3.5 pt-1.5 space-y-3.5">
              <div>
                <h3 className="text-base font-semibold tracking-tight text-foreground">
                  No connection selected
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Choose a database from the top bar or connect your PostgreSQL instance to start exploring.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-0.5">
                {/* Quick Terminal Copy Pill */}
                <button
                  type="button"
                  onClick={() => handleCopy('npm i -g @vivekmind/pg-connector && pg-connector start')}
                  className="inline-flex items-center justify-between sm:justify-start gap-2 h-9 px-3.5 rounded-xl border border-border/70 bg-muted/40 hover:bg-muted/70 text-xs font-mono text-muted-foreground hover:text-foreground transition-all duration-150 group cursor-pointer"
                  title="Click to copy setup command"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Terminal className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="truncate text-[11px]">npm i -g @vivekmind/pg-connector</span>
                  </div>
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 ml-1.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-foreground shrink-0 ml-1.5" />
                  )}
                </button>

                {/* Primary Action Button (Clean Primary Blue) */}
                {onOpenConnectWizard && (
                  <Button
                    onClick={onOpenConnectWizard}
                    size="sm"
                    className="h-9 px-4 text-xs rounded-xl gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-sm hover:shadow-primary/25 transition-all duration-150 shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Connection</span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center max-w-sm space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto text-muted-foreground/50">
            <Table2 className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">Select a table</p>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <ArrowLeft className="w-3 h-3" />
              Pick a table from the sidebar to view its data
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
