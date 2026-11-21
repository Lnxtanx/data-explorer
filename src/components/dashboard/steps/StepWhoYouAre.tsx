import { useState } from 'react';
import {
  Sparkles,
  Link2,
  Upload,
  ArrowRight,
  CheckCircle2,
  Check,
  Edit2,
  RotateCcw,
  User,
  Loader2,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';

export interface FounderProfileData {
  status: 'pending' | 'researching' | 'confirmed' | 'skipped';
  source?: 'link' | 'file' | 'skipped';
  linkUrl?: string;
  fileName?: string;
  background?: string;
  previousCompanies?: string;
  founderStage?: string;
}

interface StepWhoYouAreProps {
  displayName: string;
  onProfileComplete: (data: FounderProfileData) => void;
  isActive?: boolean;
}

export function StepWhoYouAre({
  displayName,
  onProfileComplete,
  isActive = true,
}: StepWhoYouAreProps) {
  const { user } = useAuth();
  const cleanName = displayName.replace(/\.[a-zA-Z0-9_-]+/g, '').trim() || displayName;
  const userEmail = user?.email || 'founder@company.com';
  const userPhoto = (user?.user_metadata as any)?.avatar_url || (user?.user_metadata as any)?.picture;

  const [activeTab, setActiveTab] = useState<'link' | 'file'>('link');
  const [linkInput, setLinkInput] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [profileState, setProfileState] = useState<'idle' | 'researching' | 'confirmed' | 'skipped'>('idle');

  // Editable fields for confirmation card
  const [background, setBackground] = useState('B2B SaaS, developer tools & analytics');
  const [previousRoles, setPreviousRoles] = useState('Founding Engineer / Product Lead');
  const [founderStage, setFounderStage] = useState('First-time founder');
  const [isEditing, setIsEditing] = useState(false);

  const handleStartResearch = (_source: 'link' | 'file') => {
    setProfileState('researching');
    setTimeout(() => {
      setProfileState('confirmed');
    }, 1800);
  };

  const handleSkip = () => {
    setProfileState('skipped');
    onProfileComplete({
      status: 'skipped',
      source: 'skipped',
      founderStage: 'First-time founder (default)',
      background: 'General technology / SaaS',
    });
  };

  const handleConfirmProfile = () => {
    onProfileComplete({
      status: 'confirmed',
      source: activeTab,
      linkUrl: linkInput,
      fileName: uploadedFile?.name,
      background,
      previousCompanies: previousRoles,
      founderStage,
    });
  };

  return (
    <div className="relative">
      {/* Step Circle Indicator */}
      <div
        className={cn(
          'absolute -left-[37px] top-0 w-6 h-6 rounded-full border flex items-center justify-center text-[11px] font-mono font-semibold shadow-sm shrink-0 transition-colors',
          profileState === 'confirmed' || profileState === 'skipped'
            ? 'border-emerald-500/80 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : isActive
            ? 'border-foreground/30 bg-card text-foreground font-bold'
            : 'border-border/90 bg-card text-foreground/80'
        )}
      >
        {profileState === 'confirmed' ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        ) : profileState === 'skipped' ? (
          <Check className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          '03'
        )}
      </div>

      <div>
        {/* Title & Badge */}
        <div className="flex items-center gap-2">
          <h3 className="text-sm sm:text-[15px] font-semibold text-foreground">
            Who You Are
          </h3>
          {profileState === 'confirmed' ? (
            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
              Profile Ready
            </Badge>
          ) : profileState === 'skipped' ? (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              Skipped
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              Optional · 30s
            </Badge>
          )}
        </div>

        {/* Subtitle */}
        <p className="text-xs sm:text-[13px] text-muted-foreground mt-0.5">
          I'll research your background so my advice fits you. Paste a link, or skip — I'll work with what I can find.
        </p>

        {/* ── State 1: Confirmed Profile Summary ── */}
        {profileState === 'confirmed' && (
          <div className="mt-3 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 max-w-xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-emerald-500/20">
              <div className="flex items-center gap-2.5">
                {userPhoto ? (
                  <img src={userPhoto} alt={cleanName} className="w-7 h-7 rounded-full object-cover border border-emerald-500/40" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-xs font-semibold">
                    {cleanName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    What I found about you
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {cleanName} — {activeTab === 'link' && linkInput ? `based on ${linkInput.replace(/^https?:\/\//, '')}` : 'based on your profile'}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(!isEditing)}
                className="h-6 text-[11px] gap-1 text-muted-foreground hover:text-foreground px-2"
              >
                <Edit2 className="w-3 h-3" />
                <span>{isEditing ? 'Done Editing' : 'Edit'}</span>
              </Button>
            </div>

            {isEditing ? (
              <div className="space-y-2 text-xs">
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium">Background / Industry</label>
                  <Input
                    value={background}
                    onChange={(e) => setBackground(e.target.value)}
                    className="h-7 text-xs mt-0.5"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium">Previous Roles</label>
                  <Input
                    value={previousRoles}
                    onChange={(e) => setPreviousRoles(e.target.value)}
                    className="h-7 text-xs mt-0.5"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium">Founder Stage</label>
                  <Input
                    value={founderStage}
                    onChange={(e) => setFounderStage(e.target.value)}
                    className="h-7 text-xs mt-0.5"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-background/60 border border-border/50">
                  <span className="text-[10.5px] uppercase font-mono tracking-wider text-muted-foreground block">Background</span>
                  <span className="text-[12px] font-medium text-foreground">{background}</span>
                </div>
                <div className="p-2 rounded-lg bg-background/60 border border-border/50">
                  <span className="text-[10.5px] uppercase font-mono tracking-wider text-muted-foreground block">Stage Experience</span>
                  <span className="text-[12px] font-medium text-foreground">{founderStage}</span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-muted-foreground">
                Anything I got wrong? You can edit above or continue.
              </span>
              <Button
                size="sm"
                onClick={handleConfirmProfile}
                className="h-7 text-xs font-medium gap-1.5 shadow-sm"
              >
                <span>Looks accurate</span>
                <ArrowRight className="w-3 h-3" />
              </Button>
            </div>
          </div>
        )}

        {/* ── State 2: Skipped Profile ── */}
        {profileState === 'skipped' && (
          <div className="mt-3 p-3 rounded-xl border border-border bg-card/50 flex items-center justify-between max-w-xl">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <User className="w-4 h-4 shrink-0" />
              <span>Skipped for now. AI will assume first-time founder context and adapt over time.</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setProfileState('idle')}
              className="h-6 text-[11px] text-muted-foreground hover:text-foreground gap-1 px-2"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Re-add</span>
            </Button>
          </div>
        )}

        {/* ── State 3: Researching Animation ── */}
        {profileState === 'researching' && (
          <div className="mt-3 p-4 rounded-xl border border-primary/30 bg-primary/5 flex items-center gap-3 max-w-xl">
            <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-foreground">
                Digging into your background...
              </p>
              <p className="text-[11.5px] text-muted-foreground mt-0.5">
                Synthesizing public context so recommendations fit your exact experience.
              </p>
            </div>
          </div>
        )}

        {/* ── State 4: Initial Input Intake ── */}
        {profileState === 'idle' && (
          <div className="mt-3 p-4 rounded-xl border border-border bg-card/60 max-w-xl space-y-3.5">
            {/* Auto-fetched Google info banner */}
            <div className="flex items-center gap-2.5 pb-2.5 border-b border-border/70 text-xs">
              {userPhoto ? (
                <img src={userPhoto} alt={cleanName} className="w-6 h-6 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                  {cleanName.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-muted-foreground">
                Hi <strong className="text-foreground">{cleanName}</strong> ({userEmail}) — I have your name and email from Google. Tell me a bit more:
              </span>
            </div>

            {/* Modality Tabs */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('link')}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 cursor-pointer',
                  activeTab === 'link'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                )}
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>Paste a Link</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('file')}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 cursor-pointer',
                  activeTab === 'file'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                )}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload File</span>
              </button>
            </div>

            {/* Option A: Link Input */}
            {activeTab === 'link' ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={linkInput}
                    onChange={(e) => setLinkInput(e.target.value)}
                    placeholder="https://linkedin.com/in/... or product About URL"
                    className="h-8 text-xs bg-background"
                  />
                  <Button
                    size="sm"
                    onClick={() => handleStartResearch('link')}
                    disabled={!linkInput.trim()}
                    className="h-8 text-xs font-medium shrink-0 gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Research</span>
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Your LinkedIn is best. Or your product's About / team page.
                </p>
              </div>
            ) : (
              /* Option B: File Upload */
              <div className="space-y-2">
                <label className="border-2 border-dashed border-border hover:border-primary/50 transition-colors rounded-xl p-3 flex flex-col items-center justify-center text-center cursor-pointer bg-muted/20">
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        setUploadedFile(e.target.files[0]);
                        handleStartResearch('file');
                      }
                    }}
                  />
                  <FileText className="w-5 h-5 text-muted-foreground mb-1" />
                  <span className="text-xs font-medium text-foreground">
                    {uploadedFile ? uploadedFile.name : 'Click to select or drop a file (.pdf, .docx, .txt)'}
                  </span>
                  <span className="text-[11px] text-muted-foreground mt-0.5">
                    Resume, bio, or any doc that describes you and what you've built.
                  </span>
                </label>
              </div>
            )}

            {/* Option C: Skip */}
            <div className="pt-2 border-t border-border/50 flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                className="h-7 text-xs text-muted-foreground hover:text-foreground px-2"
              >
                Skip for now — I'll figure it out as we go
              </Button>
              <span className="text-[10.5px] text-muted-foreground/70">
                AI works with or without this
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
