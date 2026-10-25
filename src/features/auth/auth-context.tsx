import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import type { Profile } from '@/types/database';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  /** True until the stored session has been read. */
  initializing: boolean;
  profileLoading: boolean;
  isStaff: boolean;
  isAdmin: boolean;
  /** Set after the user follows a password-recovery link. */
  recovering: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(env.isSupabaseConfigured);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!env.isSupabaseConfigured) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setInitializing(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_OUT') {
        setRecovering(false);
        // Drop any private data cached for the previous user.
        queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'menu' && q.queryKey[0] !== 'settings' });
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  const userId = session?.user.id ?? null;
  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId!).single();
      if (error) throw error;
      return data;
    },
  });

  const value = useMemo<AuthState>(() => {
    const profile = profileQuery.data ?? null;
    return {
      session,
      user: session?.user ?? null,
      profile,
      initializing,
      profileLoading: Boolean(userId) && profileQuery.isPending,
      isStaff: profile?.role === 'staff' || profile?.role === 'admin',
      isAdmin: profile?.role === 'admin',
      recovering,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    };
  }, [session, initializing, profileQuery.data, profileQuery.isPending, userId, recovering]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Friendly first name for greetings. */
export function firstName(profile: Profile | null, user: User | null): string {
  const name = profile?.display_name?.trim() || (user?.email ? user.email.split('@')[0]! : '');
  return name.split(/\s+/)[0] ?? '';
}
