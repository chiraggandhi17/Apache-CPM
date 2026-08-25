import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';

export type UserRole = 'admin' | 'manager' | 'editor' | 'viewer';
export type UserStatus = 'pending' | 'approved' | 'revoked';
export type FeatureKey = 'base_tier' | 'node_mutation' | 'google_calendar_sync' | 'advanced_reports' | 'admin_management';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  department: string | null;
  role: UserRole;
  status: UserStatus;
  approved_at: string | null;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  entitlements: Record<FeatureKey, boolean>;
  isLoading: boolean;
  hasFeature: (key: FeatureKey) => boolean;
  hasRole: (roles: UserRole[]) => boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [entitlements, setEntitlements] = useState<Record<FeatureKey, boolean>>({
    base_tier: true,
    node_mutation: true,
    google_calendar_sync: true,
    advanced_reports: true,
    admin_management: true,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchProfileAndEntitlements = async (userId: string, userEmail?: string, userMeta?: any) => {
    try {
      let { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      // If no profile exists yet in public.profiles (e.g. before trigger execution), auto-create fallback
      if (!prof && userEmail) {
        const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true });
        const isFirstUser = (count === null || count === 0);

        const newProf = {
          id: userId,
          email: userEmail,
          full_name: userMeta?.full_name || userEmail.split('@')[0],
          avatar_url: userMeta?.avatar_url || null,
          role: isFirstUser ? ('admin' as UserRole) : ('viewer' as UserRole),
          status: isFirstUser ? ('approved' as UserStatus) : ('pending' as UserStatus),
          approved_at: isFirstUser ? new Date().toISOString() : null,
        };

        const { data: createdProf } = await supabase
          .from('profiles')
          .insert(newProf)
          .select()
          .single();

        prof = createdProf || newProf;
      }

      setProfile(prof || null);

      if (prof) {
        // Fetch granular entitlements via RPC
        const featureKeys: FeatureKey[] = [
          'base_tier',
          'node_mutation',
          'google_calendar_sync',
          'advanced_reports',
          'admin_management',
        ];

        const checks = await Promise.all(
          featureKeys.map(async (key) => {
            try {
              const { data } = await supabase.rpc('has_feature', { p_feature_key: key, p_user_id: userId });
              return [key, data !== null && data !== undefined ? Boolean(data) : true] as [FeatureKey, boolean];
            } catch {
              return [key, true] as [FeatureKey, boolean];
            }
          })
        );

        setEntitlements(Object.fromEntries(checks) as Record<FeatureKey, boolean>);
      }
    } catch (err) {
      console.error('Profile fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        fetchProfileAndEntitlements(u.id, u.email, u.user_metadata);
      } else {
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        fetchProfileAndEntitlements(u.id, u.email, u.user_metadata);
      } else {
        setProfile(null);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const hasFeature = (key: FeatureKey): boolean => Boolean(entitlements[key]);
  const hasRole = (roles: UserRole[]): boolean => Boolean(profile && roles.includes(profile.role));

  const signOut = async () => {
    setIsLoading(true);
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setIsLoading(false);
  };

  const refreshProfile = async () => {
    if (user) await fetchProfileAndEntitlements(user.id, user.email, user.user_metadata);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        entitlements,
        isLoading,
        hasFeature,
        hasRole,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
