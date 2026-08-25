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

// Initial fallback entitlements for demo mode when Supabase backend is disconnected
const DEFAULT_DEMO_PROFILE: UserProfile = {
  id: 'demo-user-1',
  email: 'merchandiser@apache.com',
  full_name: 'Apache Merchandiser',
  avatar_url: null,
  department: 'Production',
  role: 'admin',
  status: 'approved',
  approved_at: new Date().toISOString(),
};

const DEFAULT_DEMO_ENTITLEMENTS: Record<FeatureKey, boolean> = {
  base_tier: true,
  node_mutation: true,
  google_calendar_sync: true,
  advanced_reports: true,
  admin_management: true,
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(DEFAULT_DEMO_PROFILE);
  const [entitlements, setEntitlements] = useState<Record<FeatureKey, boolean>>(DEFAULT_DEMO_ENTITLEMENTS);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fetchProfileAndEntitlements = async (userId: string) => {
    try {
      const { data: prof, error: profError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profError || !prof) {
        setProfile(DEFAULT_DEMO_PROFILE);
        setEntitlements(DEFAULT_DEMO_ENTITLEMENTS);
        return;
      }

      setProfile(prof);

      // Compute modular entitlements via RPC
      const featureKeys: FeatureKey[] = [
        'base_tier',
        'node_mutation',
        'google_calendar_sync',
        'advanced_reports',
        'admin_management',
      ];

      const checks = await Promise.all(
        featureKeys.map(async (key) => {
          const { data } = await supabase.rpc('has_feature', { p_feature_key: key, p_user_id: userId });
          return [key, data !== null && data !== undefined ? Boolean(data) : true] as [FeatureKey, boolean];
        })
      );

      setEntitlements(Object.fromEntries(checks) as Record<FeatureKey, boolean>);
    } catch {
      setProfile(DEFAULT_DEMO_PROFILE);
      setEntitlements(DEFAULT_DEMO_ENTITLEMENTS);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfileAndEntitlements(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfileAndEntitlements(session.user.id);
      } else {
        setProfile(DEFAULT_DEMO_PROFILE);
        setEntitlements(DEFAULT_DEMO_ENTITLEMENTS);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const hasFeature = (key: FeatureKey): boolean => Boolean(entitlements[key]);
  const hasRole = (roles: UserRole[]): boolean => Boolean(profile && roles.includes(profile.role));

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (user) await fetchProfileAndEntitlements(user.id);
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
