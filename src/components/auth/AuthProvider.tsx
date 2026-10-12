
import { useEffect, useState, useCallback, useRef } from 'react';
import type { User } from '@supabase/supabase-js';

import { useGoogleLogin } from '@react-oauth/google';
import { toast } from 'sonner';
import {
    loginWithGoogle,
    loginWithGithub,
    loginWithDemo,
    logout as apiLogout,
    refreshSession as apiRefreshSession,
    validateSession,
    } from '@/components/auth/api';
import {
    setSessionCookie,
    getSessionCookie,
      sessionNeedsRefresh,
    refreshSessionCookie,
} from './cookies';
import { broadcastSync, subscribeToSync } from './crossTab';
import { queryClient } from '@/lib/queryClient';
import { purgeExplorerCacheDb } from '@/lib/persist';
import { clearAllClientData } from './clearAllClientData';
import { logger } from '@/lib/logger';
import { trackEvent, startActivityTracking, stopActivityTracking } from './activity';
import { AuthContext } from './context';

// The context and `useAuth` are defined in @/lib/auth/context so that lib/ and
// hooks/ can read auth state without importing a component module. Re-exported
// here so all 13 component-layer call sites keep their existing import path.
export { useAuth } from './context';
export type { AuthContextType } from './context';

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    // Shared login handler â€” used by Google OAuth redirect callback code
    const handleGoogleLogin = useCallback(async (code: string) => {
        setIsLoggingIn(true);
        const redirectUri = window.location.origin;
        try {
            const response = await loginWithGoogle(code, redirectUri);
            const { user: dbUser, sessionExpiresAt, isNewUser } = response;

            const mappedUser: User = {
                id: dbUser.id,
                app_metadata: { provider: 'google' },
                user_metadata: {
                    full_name: dbUser.full_name,
                    avatar_url: dbUser.avatar_url
                },
                email: dbUser.email,
                aud: 'authenticated',
                created_at: dbUser.created_at,
                updated_at: dbUser.updated_at
            };

            setUser(mappedUser);

            trackEvent('login', { provider: 'google' });

            setSessionCookie({
                userId: dbUser.id,
                expiresAt: sessionExpiresAt,
            });

            broadcastSync({
                type: 'session_changed',
                payload: {
                    userId: dbUser.id,
                }
            });

            toast.dismiss('auth-toast');
            if (isNewUser) {
                toast.success(`Welcome to Schema Weaver! Signed in as ${dbUser.full_name || dbUser.email}`);
            } else {
                toast.success(`Successfully signed in with Google as ${dbUser.full_name || dbUser.email}`);
            }

        } catch (err: any) {
            toast.dismiss('auth-toast');
            logger.error('Google login failed:', err);
            toast.error(err?.message || 'Failed to sign in with Google. Please try again.');
        } finally {
            setIsLoggingIn(false);
        }
    }, []);

    const handleGithubLogin = useCallback(async (code: string) => {
        setIsLoggingIn(true);
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const redirectUri = isLocal ? undefined : window.location.origin;

        try {
            const response = await loginWithGithub(code, redirectUri);
            const { user: dbUser, sessionExpiresAt, isNewUser } = response;

            const mappedUser: User = {
                id: dbUser.id,
                app_metadata: { provider: 'github' },
                user_metadata: {
                    full_name: dbUser.full_name,
                    avatar_url: dbUser.avatar_url,
                    github_username: dbUser.github_username,
                },
                email: dbUser.email,
                aud: 'authenticated',
                created_at: dbUser.created_at,
                updated_at: dbUser.updated_at
            };

            setUser(mappedUser);

            trackEvent('login', { provider: 'github' });

            setSessionCookie({
                userId: dbUser.id,
                expiresAt: sessionExpiresAt,
            });

            broadcastSync({
                type: 'session_changed',
                payload: {
                    userId: dbUser.id,
                }
            });

            toast.dismiss('auth-toast');
            if (isNewUser) {
                toast.success(`Welcome to Schema Weaver! Account created for ${dbUser.email}`);
            } else {
                toast.success(`Successfully signed in with GitHub as ${dbUser.full_name || dbUser.github_username || dbUser.email}`);
            }

        } catch (err: any) {
            toast.dismiss('auth-toast');
            logger.error('GitHub login failed:', err);
            toast.error(err?.message || 'Failed to sign in with GitHub. Please check your GitHub permissions and try again.');
        } finally {
            setIsLoggingIn(false);
        }
    }, []);

    const handleDemoLogin = useCallback(async () => {
        setIsLoggingIn(true);
        try {
            const response = await loginWithDemo();
            const { user: dbUser, sessionExpiresAt } = response;

            const mappedUser: User = {
                id: dbUser.id,
                app_metadata: { provider: 'demo' },
                user_metadata: {
                    full_name: dbUser.full_name || 'Demo Explorer',
                    avatar_url: dbUser.avatar_url,
                    is_demo: true,
                },
                email: dbUser.email,
                aud: 'authenticated',
                created_at: dbUser.created_at || new Date().toISOString(),
                updated_at: dbUser.updated_at || new Date().toISOString()
            };

            setUser(mappedUser);

            trackEvent('login', { provider: 'demo' });

            setSessionCookie({
                userId: dbUser.id,
                expiresAt: sessionExpiresAt,
            });

            broadcastSync({
                type: 'session_changed',
                payload: {
                    userId: dbUser.id,
                }
            });

            toast.dismiss('auth-toast');
            toast.success('Connected to Schema Weaver live demo database!');
        } catch (err: any) {
            toast.dismiss('auth-toast');
            logger.error('Demo login failed:', err);
            toast.error(err?.message || 'Failed to connect to demo account.');
        } finally {
            setIsLoggingIn(false);
        }
    }, []);

    // ─── Redirect flow: detect ?code= or ?error= in URL after OAuth provider redirects back ───
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const state = params.get('state');
        const error = params.get('error');
        const errorDescription = params.get('error_description');

        if (error) {
            window.history.replaceState({}, '', window.location.pathname);
            logger.warn('[Auth] OAuth error callback:', { error, errorDescription });
            toast.error(errorDescription || `Authentication error: ${error.replace('_', ' ')}`);
            return;
        }

        if (code) {
            // Remove code & state from URL to prevent re-processing on refresh
            window.history.replaceState({}, '', window.location.pathname);
            if (state === 'github_auth' || params.get('provider') === 'github') {
                toast.loading('Completing GitHub sign in...', { id: 'auth-toast' });
                handleGithubLogin(code);
            } else {
                toast.loading('Completing Google sign in...', { id: 'auth-toast' });
                handleGoogleLogin(code);
            }
        }
    }, [handleGoogleLogin, handleGithubLogin]);

    // Stable ref to avoid re-creating callbacks and triggering infinite effect loops
    const userRef = useRef<User | null>(user);
    useEffect(() => {
        userRef.current = user;
    }, [user]);

    const isSigningOutRef = useRef(false);
    const hasInitializedRef = useRef(false);
    const isHandlingUnauthorizedRef = useRef(false);

    // ─── Sign out cleanly (stable reference, never loops) ───────────────
    const signOut = useCallback(async () => {
        if (isSigningOutRef.current) return;
        isSigningOutRef.current = true;

        const hadUser = !!userRef.current;
        trackEvent('logout');

        try {
            // Call backend to clear httpOnly session cookie
            await apiLogout();
        } catch (err) {
            logger.warn('Backend logout failed, continuing with local cleanup:', err);
        }

        // Clear all React Query cached data (prevents stale data across sessions)
        queryClient.clear();

        // Purge the IndexedDB persisted explorer cache (schema lists, stats)
        try {
            await purgeExplorerCacheDb();
        } catch (err) {
            logger.warn('Persisted cache purge failed:', err);
        }

        setUser(null);

        // Comprehensive client-side cleanup: localStorage, sessionStorage, cookies, CSRF, CacheStorage, drafts
        await clearAllClientData();

        // Broadcast logout to other tabs
        broadcastSync({ type: 'logout' });

        if (hadUser) {
            toast.success('Logged out successfully');
        }

        // Reset after cooldown
        setTimeout(() => {
            isSigningOutRef.current = false;
        }, 1500);
    }, []);

    // ─── Extend session on both server & client (stable reference) ──────
    const refreshSession = useCallback(async () => {
        if (!userRef.current || isSigningOutRef.current) return;

        try {
            const response = await apiRefreshSession();

            if (response.success) {
                refreshSessionCookie();
            }
        } catch (err: any) {
            if (err?.status === 401) {
                // Session confirmed expired on backend
                logger.warn('Backend confirmed session expired during refresh, logging out');
                await signOut();
            } else {
                logger.warn('Backend session refresh request had network hiccup, keeping local session:', err);
                refreshSessionCookie();
            }
        }
    }, [signOut]);

    // ─── Restore session once on mount (RUNS EXACTLY ONCE) ──────────────
    useEffect(() => {
        if (hasInitializedRef.current) return;
        hasInitializedRef.current = true;

        const initializeAuth = async () => {
            const params = new URLSearchParams(window.location.search);
            const isDemo = params.get('demo') === 'true';

            if (isDemo) {
                // Clear demo query param from address bar without page reload
                const cleanUrl = new URL(window.location.href);
                cleanUrl.searchParams.delete('demo');
                window.history.replaceState({}, '', cleanUrl.pathname + (cleanUrl.search ? cleanUrl.search : '') + cleanUrl.hash);

                await handleDemoLogin();
                setLoading(false);
                return;
            }

            const sessionData = getSessionCookie();

            if (sessionData) {
                // Set initial minimal user from cookie so UI doesn't flash logged out
                const minimalUser: User = {
                    id: sessionData.userId,
                    app_metadata: { provider: 'google' },
                    user_metadata: {},
                    email: '',
                    aud: 'authenticated',
                    created_at: new Date().toISOString()
                };
                setUser(minimalUser);

                // Verify with backend
                try {
                    const sessionCheck = await validateSession();
                    if (sessionCheck && sessionCheck.valid === false) {
                        logger.warn('Backend session confirmed invalid by server (401), logging out');
                        await signOut();
                        return;
                    }

                    if (sessionCheck && sessionCheck.valid && sessionCheck.userId) {
                        setUser((prev) => prev ? {
                            ...prev,
                            id: sessionCheck.userId!,
                            email: sessionCheck.email || prev.email,
                        } : prev);
                    }

                    // Check if session needs refresh
                    if (sessionNeedsRefresh()) {
                        refreshSession();
                    }
                } catch (error) {
                    // Network error, 429, 503, or server restarting: DO NOT log out, retain cached session
                    logger.warn('Session validation network check failed (offline/restarting), retaining session:', error);
                }
            } else {
                // Also check legacy localStorage for migration
                const storedUser = localStorage.getItem('schema_weaver_user');
                if (storedUser) {
                    try {
                        const parsedUser = JSON.parse(storedUser);

                        // Migrate — only store userId
                        setSessionCookie({
                            userId: parsedUser.id,
                        });

                        localStorage.removeItem('schema_weaver_user');
                        window.location.reload(); // Reload to pick up cookie path
                        return;
                    } catch {
                        localStorage.removeItem('schema_weaver_user');
                    }
                }
            }
            setLoading(false);
        };

        initializeAuth();
    }, [refreshSession, signOut]);

    // ─── Listen for sync events from other tabs ──────────────────────────
    useEffect(() => {
        const unsubscribe = subscribeToSync(async (message) => {
            if (message.type === 'logout') {
                const localSession = getSessionCookie();
                if (!localSession && !isSigningOutRef.current) {
                    queryClient.clear();
                    try {
                        await purgeExplorerCacheDb();
                    } catch {}
                    await clearAllClientData();
                    setUser(null);
                    toast.info('Logged out from another tab');
                }
            } else if (message.type === 'session_changed' && message.payload) {
                // Another tab logged in, set minimal user and let useUserProfile fetch the rest
                setUser({
                    id: message.payload.userId,
                    app_metadata: {},
                    user_metadata: {},
                    email: '',
                    aud: 'authenticated',
                    created_at: new Date().toISOString(),
                } as User);
            }
        });

        return unsubscribe;
    }, []);

    // ─── Smart 401 handler: verify before logging out ────────────────────
    useEffect(() => {
        const handleUnauthorized = async () => {
            if (!userRef.current || isSigningOutRef.current || isHandlingUnauthorizedRef.current) return;
            isHandlingUnauthorizedRef.current = true;

            try {
                // Guard against offline blips (e.g. laptop wake from sleep, Wi-Fi reconnect)
                if (typeof navigator !== 'undefined' && !navigator.onLine) {
                    logger.warn('Device appears offline, retaining session despite 401');
                    return;
                }

                // Verify with backend before destroying the session
                try {
                    const sessionCheck = await validateSession();
                    if (sessionCheck && sessionCheck.valid) {
                        // Global session is actually still valid on the server!
                        logger.warn('Received 401 from a resource endpoint, but session is valid. Ignoring.');
                        return;
                    }
                } catch {
                    // Network error / 429 during validation check — retain session
                    logger.warn('Failed to reach backend during 401 check, retaining session');
                    return;
                }

                logger.warn('Session confirmed invalid by backend, logging out');
                await signOut();
            } finally {
                setTimeout(() => {
                    isHandlingUnauthorizedRef.current = false;
                }, 2000);
            }
        };

        window.addEventListener('auth:unauthorized', handleUnauthorized);
        return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
    }, [signOut]);

    // ─── Refresh session periodically in background ─────────────────────
    useEffect(() => {
        const interval = setInterval(() => {
            if (userRef.current && sessionNeedsRefresh()) {
                refreshSession();
            }
        }, 60 * 60 * 1000); // Check every hour

        return () => clearInterval(interval);
    }, [refreshSession]);

    // ─── Engagement heartbeats while a user is signed in ────────────────
    useEffect(() => {
        if (user) {
            startActivityTracking();
        } else {
            stopActivityTracking();
        }
        return () => stopActivityTracking();
    }, [user]);

    // ─── Google Login: full page browser redirect flow ──────────────────
    const login = useGoogleLogin({
        flow: 'auth-code',
        ux_mode: 'redirect',
        redirect_uri: window.location.origin,
        scope: 'openid email profile',
        onError: () => {
            setIsLoggingIn(false);
            toast.error('Google Login Failed');
        },
    });

    const signInWithGoogle = () => {
        login();
    };

    const signInWithGithub = () => {
        const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID || '';
        const redirectUri = window.location.origin;
        const scope = 'repo user:email read:user';
        const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=github_auth`;
        window.location.href = githubAuthUrl;
    };

    return (
        <AuthContext.Provider value={{ user, loading, isLoggingIn, signInWithGoogle, signInWithGithub, signInWithDemo: handleDemoLogin, signOut, refreshSession }}>
            {children}
        </AuthContext.Provider>
    );
}


