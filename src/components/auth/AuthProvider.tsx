
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User } from '@supabase/supabase-js';

import { useGoogleLogin } from '@react-oauth/google';
import { toast } from 'sonner';
import {
    loginWithGoogle,
    loginWithGithub,
    logout as apiLogout,
    refreshSession as apiRefreshSession,
    validateSession,
    getCurrentUser,
} from '@/lib/api';
import {
    setSessionCookie,
    getSessionCookie,
    deleteSessionCookie,
    sessionNeedsRefresh,
    refreshSessionCookie,
} from '@/lib/cookies';
import { broadcastSync, subscribeToSync } from '@/lib/storage/core';
import { queryClient } from '@/lib/queryClient';
import { purgeExplorerCacheDb } from '@/lib/persist';
import { clearAllClientData } from '@/lib/clearAllClientData';
import { logger } from '@/lib/logger';
import { trackEvent, startActivityTracking, stopActivityTracking } from '@/lib/activity';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    isLoggingIn: boolean;
    signInWithGoogle: () => void;
    signInWithGithub: () => void;
    signOut: () => Promise<void>;
    refreshSession: () => void;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    isLoggingIn: false,
    signInWithGoogle: () => { },
    signInWithGithub: () => { },
    signOut: async () => { },
    refreshSession: () => { },
});

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

    // â”€â”€ Redirect flow: detect ?code= or ?error= in URL after OAuth provider redirects back â”€â”€
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

    // Restore session and validate with backend
    useEffect(() => {
        const initializeAuth = async () => {
            const sessionData = getSessionCookie();

            if (sessionData) {
                // Set minimal user from cookie (only userId available)
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
                    const isValid = await validateSession();
                    if (!isValid) {
                        logger.warn('Backend session invalid (likely restarted), logging out');
                        await signOut();
                        return;
                    }

                    // Check if session needs refresh
                    if (sessionNeedsRefresh()) {
                        refreshSessionCookie();
                    }
                } catch (error) {
                    logger.error('Session validation failed:', error);
                    await signOut();
                }
            } else {
                // Also check legacy localStorage for migration
                const storedUser = localStorage.getItem('schema_weaver_user');
                if (storedUser) {
                    try {
                        const parsedUser = JSON.parse(storedUser);

                        // Migrate â€” only store userId
                        setSessionCookie({
                            userId: parsedUser.id,
                        });

                        localStorage.removeItem('schema_weaver_user');
                        window.location.reload(); // Reload to pick up cookie path
                    } catch {
                        localStorage.removeItem('schema_weaver_user');
                    }
                }
            }
            setLoading(false);
        };

        initializeAuth();
    }, []);

    // Listen for logout from other tabs
    useEffect(() => {
        const unsubscribe = subscribeToSync(async (message) => {
            if (message.type === 'logout') {
                setUser(null);
                toast.info('Logged out from another tab');
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

    // Listen for unauthorized events from API client
    useEffect(() => {
        const handleUnauthorized = () => {
            if (!user) return;
            logger.warn('Received global 401 event, logging out');
            signOut();
        };

        window.addEventListener('auth:unauthorized', handleUnauthorized);
        return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
    }, [user]);

    // Refresh session periodically
    useEffect(() => {
        const interval = setInterval(() => {
            if (user && sessionNeedsRefresh()) {
                refreshSessionCookie();
            }
        }, 60 * 60 * 1000); // Check every hour

        return () => clearInterval(interval);
    }, [user]);

    // Start/stop engagement heartbeats while a user is signed in.
    useEffect(() => {
        if (user) {
            startActivityTracking();
        } else {
            stopActivityTracking();
        }
        return () => stopActivityTracking();
    }, [user]);

    const refreshSession = useCallback(async () => {
        if (user) {
            try {
                const response = await apiRefreshSession();

                if (response.success) {
                    refreshSessionCookie();
                }
            } catch (err: any) {
                if (err?.isUnauthorized) {
                    // Session expired, log out
                    logger.warn('Session expired, logging out');
                    await signOut();
                } else {
                    logger.warn('Session refresh failed:', err);
                    // Also refresh local cookie as fallback
                    refreshSessionCookie();
                }
            }
        }
    }, [user]);

    // â”€â”€ Google Login: full page browser redirect flow â”€â”€
    const login = useGoogleLogin({
        flow: 'auth-code',
        ux_mode: 'redirect',
        redirect_uri: window.location.origin,
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

    const signOut = useCallback(async () => {
        // Record the logout before backend clears the session cookie.
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

        // Comprehensive client-side cleanup: localStorage, sessionStorage, cookies, CSRF
        clearAllClientData();

        // Broadcast logout to other tabs
        broadcastSync({ type: 'logout' });

        if (user) {
            toast.success('Logged out successfully');
        }
    }, [user]);

    return (
        <AuthContext.Provider value={{ user, loading, isLoggingIn, signInWithGoogle, signInWithGithub, signOut, refreshSession }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
