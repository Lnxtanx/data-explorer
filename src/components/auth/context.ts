// =============================================================================
// Auth context definition.
//
// WHY THIS FILE EXISTS
//
// The React context and its consumer hook lived inside
// components/auth/AuthProvider.tsx, which forced four non-UI modules to import
// a component module in order to read auth state:
//
//   lib/api/connector/hooks.ts        useAuth
//   lib/api/data/connection/index.ts  useAuth
//   hooks/useGreeting.ts              useAuth
//   hooks/useUserProfile.ts           useAuth
//
// Those are layer inversions: lib/ and hooks/ sat below components/, so
// depending on it inverts the graph and creates a real module cycle
// (lib/api/connector/hooks -> AuthProvider -> lib/api -> lib/api/client).
//
// The dependency is inverted here instead: this leaf module OWNS the context and
// the hook, and the provider component depends on IT. Consumers below the UI
// layer import from here; the 13 component-layer importers keep using
// @/components/auth/AuthProvider, which re-exports `useAuth` unchanged, so no
// call site had to change.
//
// Phase 4 moves this to features/auth/ along with AuthProvider, cookies,
// cross-tab sync and the logout sweep. It is deliberately a leaf with no
// imports beyond react and the Supabase User type, so that move stays a
// directory rename rather than a graph edit.
// =============================================================================

import { createContext, useContext } from 'react';
import type { User } from '@supabase/supabase-js';

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  isLoggingIn: boolean;
  signInWithGoogle: () => void;
  signInWithGithub: () => void;
  signInWithDemo: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => void;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isLoggingIn: false,
  signInWithGoogle: () => { },
  signInWithGithub: () => { },
  signInWithDemo: async () => { },
  signOut: async () => { },
  refreshSession: () => { },
});

/** Read the current auth session. */
export const useAuth = () => useContext(AuthContext);
