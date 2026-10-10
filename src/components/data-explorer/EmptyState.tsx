// =============================================================================
// Empty State - Professional placeholder with interactive video & voice controls
// =============================================================================

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Table2, ArrowLeft, Plus, Terminal, Copy, Check,
  Play, Pause, Volume2, Volume1, VolumeX, Maximize2, Minimize2,
  RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface EmptyStateProps {
  hasConnection: boolean;
  onOpenConnectWizard?: () => void;
}

const CONNECTOR_VIDEO_SRC = '/pg_connector_flow.mp4';

export function EmptyState({ hasConnection, onOpenConnectWizard }: EmptyStateProps) {
  const [copied, setCopied] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Video & Audio Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(0.85);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [showCenterFeedback, setShowCenterFeedback] = useState<string | null>(null);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize playback (start muted for browser autoplay policy compliance)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    video.volume = volume;

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => setIsPlaying(true))
        .catch(() => {
          setIsPlaying(false);
        });
    }

    return () => {
      video.pause();
    };
  }, []);

  // Sync fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Auto-hide controls when playing and inactive
  const showControlsTemporarily = useCallback(() => {
    setIsControlsVisible(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setIsControlsVisible(false);
      }, 2500);
    }
  }, [isPlaying]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().then(() => {
        setIsPlaying(true);
        triggerFeedback('play');
      }).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
      setIsControlsVisible(true);
      triggerFeedback('pause');
    }
  };

  const triggerFeedback = (type: string) => {
    setShowCenterFeedback(type);
    setTimeout(() => setShowCenterFeedback(null), 600);
  };

  const handleToggleMute = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    if (isMuted) {
      video.muted = false;
      const targetVolume = volume === 0 ? 0.85 : volume;
      video.volume = targetVolume;
      setVolume(targetVolume);
      setIsMuted(false);
      toast.success('Voice narration unmuted');
      triggerFeedback('unmute');
    } else {
      video.muted = true;
      setIsMuted(true);
      toast.info('Narration muted');
      triggerFeedback('mute');
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    const video = videoRef.current;
    if (!video) return;

    const clamped = Math.max(0, Math.min(1, newVolume));
    video.volume = clamped;
    setVolume(clamped);

    if (clamped === 0) {
      video.muted = true;
      setIsMuted(true);
    } else if (isMuted) {
      video.muted = false;
      setIsMuted(false);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressBarRef.current;
    const video = videoRef.current;
    if (!bar || !video || duration <= 0) return;

    const rect = bar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    video.currentTime = ratio * duration;
    setCurrentTime(ratio * duration);
  };

  const handleReplay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    setCurrentTime(0);
    video.play().then(() => setIsPlaying(true)).catch(() => {});
    toast.success('Restarted from beginning');
  };

  const handleSkip = (seconds: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    const nextTime = Math.max(0, Math.min(duration, video.currentTime + seconds));
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const toggleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleCopy = (command: string) => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  // Progress percentage
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex-1 flex flex-col items-center justify-start p-6 pt-5 sm:pt-7 pb-16 overflow-y-auto">
      {!hasConnection ? (
        <div className="w-full max-w-xl text-center space-y-4">
          {/* ─── Unified Hero Card with Video & Controls ─── */}
          <div className="rounded-2xl border border-border/70 bg-card/70 p-2 shadow-lg backdrop-blur-sm overflow-hidden text-left">
            {/* Video Player Container */}
            <div 
              ref={containerRef}
              onMouseMove={showControlsTemporarily}
              onMouseEnter={() => setIsControlsVisible(true)}
              onMouseLeave={() => isPlaying && setIsControlsVisible(false)}
              className="group relative aspect-[16/9] w-full rounded-xl overflow-hidden bg-black/90 border border-border/40 shadow-sm select-none cursor-pointer"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'k') {
                  e.preventDefault();
                  togglePlay();
                } else if (e.key === 'm') {
                  e.preventDefault();
                  handleToggleMute();
                } else if (e.key === 'f') {
                  e.preventDefault();
                  if (containerRef.current) {
                    if (!document.fullscreenElement) containerRef.current.requestFullscreen().catch(() => {});
                    else document.exitFullscreen().catch(() => {});
                  }
                }
              }}
            >
              <video
                ref={videoRef}
                src={CONNECTOR_VIDEO_SRC}
                autoPlay
                loop
                muted={isMuted}
                playsInline
                preload="metadata"
                controls={false}
                disablePictureInPicture
                disableRemotePlayback
                onClick={togglePlay}
                onTimeUpdate={() => videoRef.current && setCurrentTime(videoRef.current.currentTime)}
                onLoadedMetadata={() => videoRef.current && setDuration(videoRef.current.duration)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                className="w-full h-full object-contain pointer-events-auto transform-gpu will-change-transform"
              />

              {/* ── Top-Right Pill: Unmute Voice Narration ── */}
              {isMuted && (
                <button
                  type="button"
                  onClick={handleToggleMute}
                  className="absolute top-3 right-3 z-30 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background/90 hover:bg-background text-xs font-medium text-foreground border border-border/80 shadow-md backdrop-blur-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
                  title="Click to enable voice narration"
                >
                  <Volume2 className="w-3.5 h-3.5 text-primary animate-pulse" />
                  <span>Unmute Voice Narration</span>
                </button>
              )}

              {/* ── Center Feedback Overlay (Play/Pause/Mute flash) ── */}
              {showCenterFeedback && (
                <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none animate-out fade-out duration-500">
                  <div className="w-16 h-16 rounded-full bg-black/70 backdrop-blur-md flex items-center justify-center text-white border border-white/20 shadow-2xl scale-110 transition-transform">
                    {showCenterFeedback === 'play' && <Play className="w-7 h-7 fill-current ml-1" />}
                    {showCenterFeedback === 'pause' && <Pause className="w-7 h-7 fill-current" />}
                    {showCenterFeedback === 'unmute' && <Volume2 className="w-7 h-7 text-emerald-400" />}
                    {showCenterFeedback === 'mute' && <VolumeX className="w-7 h-7 text-rose-400" />}
                  </div>
                </div>
              )}

              {/* ── Center Play Overlay when paused ── */}
              {!isPlaying && !showCenterFeedback && (
                <div 
                  onClick={togglePlay}
                  className="absolute inset-0 z-10 flex items-center justify-center bg-black/35 backdrop-blur-[1px] transition-all cursor-pointer"
                >
                  <div className="w-14 h-14 rounded-full bg-primary/95 text-primary-foreground flex items-center justify-center shadow-xl hover:scale-110 hover:bg-primary transition-all">
                    <Play className="w-6 h-6 ml-0.5 fill-current" />
                  </div>
                </div>
              )}

              {/* ── Bottom Controls Overlay ── */}
              <div 
                className={`absolute inset-x-0 bottom-0 z-30 pt-10 pb-2.5 px-3 bg-gradient-to-t from-black/85 via-black/50 to-transparent transition-opacity duration-300 pointer-events-auto ${
                  isControlsVisible || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                {/* ── Scrubbable Progress Bar ── */}
                <div 
                  ref={progressBarRef}
                  onClick={handleSeek}
                  className="group/progress relative w-full h-1.5 hover:h-2.5 bg-white/25 rounded-full cursor-pointer transition-all mb-2 flex items-center"
                  title="Click or drag to seek"
                >
                  {/* Progress Fill */}
                  <div 
                    className="h-full bg-primary rounded-full relative transition-all duration-75"
                    style={{ width: `${progressPercent}%` }}
                  >
                    {/* Scrubber Thumb */}
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-3 rounded-full bg-white shadow-md opacity-0 group-hover/progress:opacity-100 transition-opacity" />
                  </div>
                </div>

                {/* ── Control Action Buttons ── */}
                <div className="flex items-center justify-between gap-2 text-white">
                  {/* Left: Play/Pause, Replay, Time */}
                  <div className="flex items-center gap-1.5">
                    {/* Play/Pause Button */}
                    <button
                      type="button"
                      onClick={togglePlay}
                      className="p-1.5 rounded-lg text-white/90 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
                      title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                    >
                      {isPlaying ? (
                        <Pause className="w-4 h-4 fill-current" />
                      ) : (
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      )}
                    </button>

                    {/* Replay 10s back */}
                    <button
                      type="button"
                      onClick={(e) => handleSkip(-10, e)}
                      className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer hidden sm:flex items-center text-[10px] font-mono"
                      title="Skip back 10 seconds"
                    >
                      -10s
                    </button>

                    {/* Restart Button */}
                    <button
                      type="button"
                      onClick={handleReplay}
                      className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
                      title="Restart video"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>

                    {/* Timestamp Display */}
                    <span className="text-[11px] font-mono text-white/80 select-none ml-1">
                      {formatTime(currentTime)} <span className="text-white/40">/</span> {formatTime(duration)}
                    </span>
                  </div>

                  {/* Right: Audio / Voice Controls & Fullscreen */}
                  <div className="flex items-center gap-2">
                    {/* Voice Controls: Volume Button & Slider */}
                    <div className="flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded-lg border border-white/10 backdrop-blur-sm">
                      <button
                        type="button"
                        onClick={handleToggleMute}
                        className="p-1 rounded text-white/90 hover:text-white transition-colors cursor-pointer"
                        title={isMuted ? 'Unmute voice narration (m)' : 'Mute voice narration (m)'}
                      >
                        {isMuted || volume === 0 ? (
                          <VolumeX className="w-4 h-4 text-rose-400" />
                        ) : volume <= 0.5 ? (
                          <Volume1 className="w-4 h-4 text-white/90" />
                        ) : (
                          <Volume2 className="w-4 h-4 text-primary" />
                        )}
                      </button>

                      {/* Volume Slider */}
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={isMuted ? 0 : volume}
                        onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                        className="w-14 sm:w-20 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer accent-primary"
                        title={`Voice Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
                      />
                    </div>

                    {/* Fullscreen Button */}
                    <button
                      type="button"
                      onClick={toggleFullscreen}
                      className="p-1.5 rounded-lg text-white/90 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
                      title={isFullscreen ? 'Exit Fullscreen (f)' : 'Fullscreen (f)'}
                    >
                      {isFullscreen ? (
                        <Minimize2 className="w-4 h-4" />
                      ) : (
                        <Maximize2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Sub-bar with title */}
            <div className="flex items-center justify-between px-2 pt-2.5 pb-1">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground select-none">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Connector Setup & Walkthrough</span>
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
                  Choose a database from the top bar or connect your PostgreSQL instance using the CLI connector.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-0.5">
                {/* Quick Terminal Copy Pill */}
                <button
                  type="button"
                  onClick={() => handleCopy('npm i -g @schema-weaver/pg-connector && pg-connector start')}
                  className="inline-flex items-center justify-between sm:justify-start gap-2 h-9 px-3.5 rounded-xl border border-border/70 bg-muted/40 hover:bg-muted/70 text-xs font-mono text-muted-foreground hover:text-foreground transition-all duration-150 group cursor-pointer"
                  title="Click to copy setup command"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Terminal className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="truncate text-[11px]">npm i -g @schema-weaver/pg-connector</span>
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
