/**
 * Profile Settings
 *
 * User profile section showing account information.
 */

import { Mail, Calendar, Shield, LogOut, Github, CheckCircle2, } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PremiumAvatar } from '../billing/components/PremiumAvatar';
import { Badge } from '@/components/ui/badge';
import { useUserProfile } from '../auth/hooks/useUserProfile';
import type { User } from '@supabase/supabase-js';
import { useAuth } from '@/components/auth/AuthProvider';

interface ProfileSettingsProps {
  user?: User | null;
  signOut?: () => void;
  signInWithGoogle?: () => void;
  signInWithGithub?: () => void;
  onNavigate?: (section: any) => void;
}

function GoogleIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.15C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.61H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.39l3.99-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.61l3.99 3.15c.95-2.85 3.6-4.96 6.72-4.96z"
      />
    </svg>
  );
}

export function ProfileSettings({ user, signOut, signInWithGoogle, signInWithGithub }: ProfileSettingsProps) {
  const { profile, planId, isLoading } = useUserProfile();
  const { isLoggingIn, signInWithGithub: authSignInWithGithub } = useAuth();
  const handleGithubSignIn = signInWithGithub || authSignInWithGithub;

  if (!user && !isLoggingIn) {
    return (
      <div className="h-full p-8 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mb-6">
          <Shield className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold tracking-tight text-foreground mb-2">Secure Access</h3>
        <p className="text-muted-foreground mb-8 max-w-sm text-sm">
          Sign in to access your profile, sync repository projects, and manage schemas across your devices.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs justify-center">
          {signInWithGoogle && (
            <Button
              onClick={signInWithGoogle}
              className="gap-2.5 rounded-xl flex-1 border shadow-sm"
              variant="outline"
            >
              <GoogleIcon className="w-4 h-4" />
              <span>Google</span>
            </Button>
          )}
          {handleGithubSignIn && (
            <Button
              onClick={handleGithubSignIn}
              className="gap-2.5 rounded-xl flex-1 bg-[#24292e] hover:bg-[#1b1f23] text-white shadow-sm"
              variant="default"
            >
              <Github className="w-4 h-4" />
              <span>GitHub</span>
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (isLoading || isLoggingIn) {
    return (
      <div className="p-8 space-y-8 animate-pulse">
        <div className="flex items-center gap-6">
          <div className="h-20 w-20 rounded-full bg-muted" />
          <div className="space-y-3 flex-1">
            <div className="h-6 w-48 bg-muted rounded" />
            <div className="h-4 w-32 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  const rawDisplayName = profile?.full_name || user?.user_metadata?.full_name || 'User';
  const displayName = rawDisplayName
    .replace(/[^\w\s\-.À-ſ]/gu, '')
    .trim() || 'User';

  const displayEmail = profile?.email || user?.email || 'No email';
  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || '';

  const githubUsername = profile?.github_username || user?.user_metadata?.github_username;
  const isGithubConnected = !!githubUsername || profile?.auth_provider === 'github' || user?.app_metadata?.provider === 'github';

  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  const createdAt = (profile?.created_at || user?.created_at)
    ? new Date(profile?.created_at || user?.created_at || '').toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
    : 'Joined recently';

  const PLAN_LABELS: Record<string, string> = {
    free: 'Free',
    starter: 'Starter',
    pro_monthly: 'Pro',
    power_monthly: 'Power',
  };

  const planName = PLAN_LABELS[planId] || planId.split('_')[0].charAt(0).toUpperCase() + planId.split('_')[0].slice(1);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-8">
        <div className="flex items-start gap-6">
          <PremiumAvatar
            avatarUrl={avatarUrl}
            initials={initials}
            planId={planId}
            size="xl"
            shape="rounded"
          />

          <div className="flex-1 min-w-0">
            <h3 className="text-2xl font-semibold tracking-tight truncate">{displayName}</h3>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="bg-background font-medium px-2.5 py-0.5 rounded-full ring-1 ring-border">
                {planName} Plan
              </Badge>
              <Badge variant="secondary" className="font-medium px-2.5 py-0.5 rounded-full flex items-center gap-1.5 text-muted-foreground bg-muted/50 border-transparent">
                Data Explorer
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="px-8 pb-8 space-y-6">
        {/* Account Info Card */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Account Details
          </h4>
          <div className="border rounded-xl overflow-hidden bg-background divide-y">
            <div className="flex items-center gap-3 px-4 py-3.5">
              <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-sm truncate font-medium">{displayEmail}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 px-4 py-3.5">
              <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Member since</p>
                <p className="text-sm font-medium">{createdAt}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Connected Authentication Accounts */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Connected Accounts
          </h4>
          <div className="border rounded-xl overflow-hidden bg-background divide-y">
            {/* Google / Email Account */}
            <div className="flex items-center justify-between gap-4 px-4 py-3.5">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0 border">
                  <GoogleIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-none mb-1">Google</p>
                  <p className="text-xs text-muted-foreground truncate">{displayEmail}</p>
                </div>
              </div>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs font-medium px-2.5 py-0.5 shrink-0 flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3" />
                Connected
              </Badge>
            </div>

            {/* GitHub Account */}
            <div className="flex items-center justify-between gap-4 px-4 py-3.5">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-[#24292e] text-white flex items-center justify-center shrink-0 shadow-sm">
                  <Github className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-none mb-1">GitHub</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {isGithubConnected
                      ? (githubUsername ? `@${githubUsername}` : 'Connected')
                      : 'Not connected'}
                  </p>
                </div>
              </div>
              {isGithubConnected ? (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs font-medium px-2.5 py-0.5 shrink-0 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3" />
                  Connected
                </Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGithubSignIn}
                  className="gap-1.5"
                >
                  <Github className="w-3.5 h-3.5" />
                  Connect
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="pt-2">
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-4 py-3 bg-background hover:bg-destructive/5 text-destructive hover:text-destructive transition-colors text-left border rounded-xl"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Sign out</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}


