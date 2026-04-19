/**
 * Profile Settings
 *
 * User profile section showing account information.
 */

import { Mail, Calendar, Shield, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { User } from '@supabase/supabase-js';
import { useAuth } from '@/components/auth/AuthProvider';

interface ProfileSettingsProps {
  user?: User | null;
  signOut?: () => void;
  signInWithGoogle?: () => void;
  onNavigate?: (section: any) => void;
}

export function ProfileSettings({ user, signOut, signInWithGoogle }: ProfileSettingsProps) {
  const { profile, planId, isLoading } = useUserProfile();
  const { isLoggingIn } = useAuth();

  if (!user && !isLoggingIn) {
    return (
      <div className="h-full p-8 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mb-6">
          <Shield className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-xl font-semibold mb-2">Secure access</h3>
        <p className="text-muted-foreground mb-8 max-w-sm text-sm">
          Sign in to access your profile and sync your work across all your devices.
        </p>
        {signInWithGoogle && (
          <Button
            onClick={signInWithGoogle}
            className="gap-3 px-8 rounded-full"
            variant="default"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-4 h-4" />
            Continue with Google
          </Button>
        )}
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
    .replace(/[^\w\s\-\.\u00C0-\u017F]/gu, '')
    .trim() || 'User';

  const displayEmail = profile?.email || user?.email || 'No email';
  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || '';

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

  const planName = (planId || 'free').charAt(0).toUpperCase() + (planId || 'free').slice(1);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-8">
        <div className="flex items-start gap-6">
          <Avatar className="w-20 h-20 border shadow-sm rounded-2xl">
            <AvatarImage src={avatarUrl} className="object-cover" />
            <AvatarFallback className="bg-primary/5 text-primary text-xl font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>

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

      <div className="px-8 pb-8">
        <div className="border rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3.5 bg-background">
            <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="text-sm truncate">{displayEmail}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 px-4 py-3.5 bg-background border-t">
            <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Member since</p>
              <p className="text-sm">{createdAt}</p>
            </div>
          </div>

          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-4 py-3.5 bg-background hover:bg-destructive/5 transition-colors text-left border-t"
          >
            <LogOut className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm">Sign out</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
