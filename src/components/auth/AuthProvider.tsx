
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User } from '@supabase/supabase-js';

import { useGoogleLogin } from '@react-oauth/google';
import { toast } from 'sonner';
import {
    loginWithGoogle,
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
    clearRecentFiles,
    clearUserPreferences,
} from '@/lib/cookies';
// Fixed import path: storage/core is self-contained (no SQL editor deps)
import { broadcastSync, subscribeToSync, clearAllFileStates } from '@/lib/storage/core';
import { queryClient } from '@/lib/queryClient';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    isLoggingIn: boolean;
    signInWithGoogle: () => void;
    signOut: () => Promise<void>;
    refreshSession: () => void;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    isLoggingIn: false,
    signInWithGoogle: () => { },
    signOut: async () => { },
    refreshSession: () => { },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [isLoggingIn, setIsLoggingIn] = useState(false);

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
                        console.warn('Backend session invalid (likely restarted), logging out');
                        await signOut();
                        return;
                    }

                    // Check if session needs refresh
                    if (sessionNeedsRefresh()) {
                        refreshSessionCookie();
                    }
                } catch (error) {
                    console.error('Session validation failed:', error);
                    await signOut();
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
            console.warn('Received global 401 event, logging out');
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
                    console.warn('Session expired, logging out');
                    await signOut();
                } else {
                    console.warn('Session refresh failed:', err);
                    // Also refresh local cookie as fallback
                    refreshSessionCookie();
                }
            }
        }
    }, [user]);

    const login = useGoogleLogin({
        flow: 'auth-code',
        onSuccess: async (codeResponse) => {
            setIsLoggingIn(true);
            try {
                const { code } = codeResponse;

                const response = await loginWithGoogle(code);
                const { user: dbUser, sessionExpiresAt } = response;

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

                toast.success(`Welcome back, ${dbUser.full_name}`);

            } catch (err: any) {
                console.error('Login failed:', err);
                toast.error(err?.message || 'Login failed');
            } finally {
                setIsLoggingIn(false);
            }
        },
        onError: () => {
            setIsLoggingIn(false);
            toast.error('Google Login Failed');
        },
    });

    const signInWithGoogle = () => {
        login();
    };

    const signOut = useCallback(async () => {
        try {
            // Call backend to clear httpOnly session cookie
            await apiLogout();
        } catch (err) {
            console.warn('Backend logout failed, continuing with local cleanup:', err);
        }

        // Clear all React Query cached data (prevents stale data across sessions)
        queryClient.clear();

        setUser(null);

        // Clear local cookie
        deleteSessionCookie();

        // Clear legacy localStorage if exists
        localStorage.removeItem('schema_weaver_user');

        // Clear user-related cached data
        clearRecentFiles();
        clearUserPreferences();
        clearAllFileStates();

        // Clear dashboard panel state (persisted connectionId)
        localStorage.removeItem('schema-weaver:dashboard-panel');

        // Broadcast logout to other tabs
        broadcastSync({ type: 'logout' });

        if (user) {
            toast.success('Logged out successfully');
        }
    }, [user]);

    return (
        <AuthContext.Provider value={{ user, loading, isLoggingIn, signInWithGoogle, signOut, refreshSession }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
