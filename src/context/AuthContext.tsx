import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';

export type UserRole = 'super_admin' | 'org_admin' | 'level_1' | 'level_2' | 'level_3' | 'senior_manager' | 'junior_manager' | 'viewer' | 'editor' | 'manager' | 'admin';
export type UserStatus = 'pending' | 'approved' | 'revoked';

export interface UserProfile {
  id: string;
  org_id: string | null;
  team_id: string | null;
  email: string;
  full_name: string | null;
  role: UserRole;
  account_type?: 'individual' | 'organization';
  tier?: 'tier_1' | 'tier_2' | 'tier_3';
  department?: string | null;
  status: UserStatus;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  org_code?: string;
  primary_admin_email?: string;
  is_activated?: boolean;
  subscription_tier: 'starter' | 'pro' | 'enterprise';
  status: 'active' | 'suspended' | 'cancelled';
  logo_url: string | null;
  brand_color: string | null;
  brand_title: string | null;
  brand_tagline: string | null;
  features: {
    google_calendar_sync: boolean;
    advanced_reports: boolean;
    node_mutation: boolean;
  };
}

export interface Team {
  id: string;
  org_id: string;
  parent_team_id: string | null;
  name: string;
  level_depth: number;
  default_role?: UserRole;
  created_at: string;
  updated_at: string;
}

export type FeatureKey = 'base_tier' | 'google_calendar_sync' | 'advanced_reports' | 'admin_management' | 'node_mutation';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  organization: Organization | null;
  team: Team | null;
  isSuperAdmin: boolean;
  isOrgAdmin: boolean;
  isApproved: boolean;
  isIndividual: boolean;
  accessLevel: 1 | 2 | 3;
  tier: 1 | 2 | 3;
  setTier: (tier: 1 | 2 | 3) => void;
  hasFeature: (feature: FeatureKey) => boolean;
  hasRole: (roles: UserRole[]) => boolean;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  promoteToSuperAdmin: () => Promise<void>;
  requestUpgrade: (requestedTier: 1 | 2 | 3, notes?: string) => Promise<{ success: boolean; message: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [entitlements, setEntitlements] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Active Tier State (1 = Personal Starter, 2 = Pro Power User, 3 = Enterprise)
  const [tierState, setTierState] = useState<1 | 2 | 3>(() => {
    const saved = localStorage.getItem('cadence_user_tier');
    if (saved) return Number(saved) as 1 | 2 | 3;
    return 1; // Default to Tier 1 Personal Free
  });

  const setTier = (newTier: 1 | 2 | 3) => {
    setTierState(newTier);
    localStorage.setItem('cadence_user_tier', String(newTier));
  };

  const fetchProfileAndOrg = async (userId: string) => {
    try {
      // 1. Fetch Profile
      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profErr) throw profErr;

      let currentProfile = prof as UserProfile | null;

      if (!currentProfile && user?.email) {
        const isEmailAdmin = user.email.toLowerCase().includes('admin');
        const defaultRole: UserRole = isEmailAdmin ? 'super_admin' : 'level_1';
        const { data: newProf } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            email: user.email,
            full_name: user.user_metadata?.full_name || user.email.split('@')[0],
            role: defaultRole,
            account_type: isEmailAdmin ? 'organization' : 'individual',
            tier: 'tier_1',
            status: 'approved',
          })
          .select()
          .single();

        currentProfile = newProf as UserProfile;
      }

      setProfile(currentProfile);

      // Determine default tier from organization or personal profile
      if (currentProfile?.org_id) {
        const { data: org } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', currentProfile.org_id)
          .maybeSingle();
        setOrganization(org);
        setTierState(3); // Organization users get Tier 3
      } else {
        // Individual personal account
        const profileTier = currentProfile?.tier === 'tier_3' ? 3 : currentProfile?.tier === 'tier_2' ? 2 : 1;
        setTierState(profileTier);
      }

      // 3. Fetch Team
      if (currentProfile?.team_id) {
        const { data: teamData } = await supabase
          .from('teams')
          .select('*')
          .eq('id', currentProfile.team_id)
          .maybeSingle();
        setTeam(teamData);
      }

      // 4. Fetch User Entitlements
      const { data: entList } = await supabase
        .from('user_feature_entitlements')
        .select('feature_key, enabled')
        .eq('user_id', userId);

      const entMap: Record<string, boolean> = {};
      if (entList) {
        entList.forEach((e: any) => {
          entMap[e.feature_key] = e.enabled;
        });
      }
      setEntitlements(entMap);
    } catch (err) {
      console.error('Error fetching user profile/org:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const promoteToSuperAdmin = async () => {
    if (!user?.id) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          email: user.email || '',
          full_name: profile?.full_name || (user.email ? user.email.split('@')[0] : 'Admin User'),
          role: 'super_admin',
          account_type: 'organization',
          status: 'approved',
          updated_at: new Date().toISOString(),
        });
      if (error) throw error;
      await fetchProfileAndOrg(user.id);
      alert('🎉 Account successfully promoted to Platform Super Admin!');
    } catch (err: any) {
      console.error('Failed to promote user to super admin:', err);
      alert('Error promoting account: ' + err.message);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        fetchProfileAndOrg(currentUser.id);
      } else {
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        fetchProfileAndOrg(currentUser.id);
      } else {
        setProfile(null);
        setOrganization(null);
        setTeam(null);
        setIsLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = async () => {
    if (user?.id) {
      await fetchProfileAndOrg(user.id);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setOrganization(null);
    setTeam(null);
  };

  const isSuperAdmin = Boolean(
    profile?.role === 'super_admin' || 
    profile?.role === 'admin' || 
    profile?.role === 'org_admin' ||
    (profile?.email && profile.email.toLowerCase().includes('admin')) ||
    (user?.email && user.email.toLowerCase().includes('admin'))
  );
  
  const isOrgAdmin = profile?.role === 'org_admin' || isSuperAdmin;
  const isApproved = profile?.status === 'approved' || isOrgAdmin;
  const isIndividual = (!profile?.org_id || profile?.account_type === 'individual') && !isSuperAdmin;

  // Normalized Access Level: 1 = Full, 2 = Limited, 3 = View Only
  const accessLevel: 1 | 2 | 3 = (() => {
    if (isSuperAdmin || isOrgAdmin) return 1;
    if (isIndividual || !profile?.org_id) return 1;
    if (profile?.role === 'level_1' || profile?.role === 'senior_manager') return 1;
    if (profile?.role === 'level_2' || profile?.role === 'junior_manager' || profile?.role === 'editor' || profile?.role === 'manager') return 2;
    return 3;
  })();

  const hasFeature = (feature: FeatureKey): boolean => {
    if (isSuperAdmin) return true;
    if (entitlements[feature] !== undefined) {
      return entitlements[feature];
    }
    if (isIndividual) return true;
    if (organization?.features && organization.features[feature as keyof typeof organization.features] !== undefined) {
      return organization.features[feature as keyof typeof organization.features];
    }
    return true;
  };

  const hasRole = (allowedRoles: UserRole[]): boolean => {
    if (isSuperAdmin) return true;
    if (!profile?.role) return false;
    return allowedRoles.includes(profile.role);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        organization,
        team,
        isSuperAdmin,
        isOrgAdmin,
        isApproved,
        isIndividual,
        accessLevel,
        tier: tierState,
        setTier,
        hasFeature,
        hasRole,
        isLoading,
        signOut,
        refreshProfile,
        promoteToSuperAdmin,
        requestUpgrade: async () => ({ success: true, message: 'Request submitted' }),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
