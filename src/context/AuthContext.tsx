import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export type UserRole = 
  | 'org_admin' 
  | 'level_1' // Full Access (CPM / Department Lead)
  | 'level_2' // Limited Access (Task Contributor)
  | 'level_3' // View Only
  | 'super_admin'
  // Legacy aliases for backward compatibility
  | 'senior_manager' 
  | 'junior_manager' 
  | 'admin' 
  | 'manager' 
  | 'editor' 
  | 'viewer';

export type UserStatus = 'pending' | 'approved' | 'revoked';

export type FeatureKey = 
  | 'base_tier' 
  | 'google_calendar_sync' 
  | 'advanced_reports' 
  | 'node_mutation' 
  | 'admin_management';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  department: string | null;
  role: UserRole;
  status: UserStatus;
  org_id: string | null;
  team_id: string | null;
  custom_role_id?: string | null;
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

interface AuthContextType {
  user: any | null;
  profile: UserProfile | null;
  organization: Organization | null;
  team: Team | null;
  isLoading: boolean;
  isSuperAdmin: boolean;
  isOrgAdmin: boolean;
  isApproved: boolean;
  isIndividual: boolean;
  tier: 1 | 2 | 3;
  setTier: (tier: 1 | 2 | 3) => void;
  accessLevel: 1 | 2 | 3;
  hasFeature: (feature: FeatureKey) => boolean;
  hasRole: (roles: UserRole[]) => boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [entitlements, setEntitlements] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Active Tier State (1 = Personal Starter, 2 = Pro Power User, 3 = Enterprise)
  const [tierState, setTierState] = useState<1 | 2 | 3>(() => {
    const saved = localStorage.getItem('cadence_user_tier');
    if (saved) return Number(saved) as 1 | 2 | 3;
    return 3; // Default to full suite
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
        const defaultRole: UserRole = user.email.includes('admin') ? 'org_admin' : 'level_1';
        const { data: newProf } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            email: user.email,
            full_name: user.user_metadata?.full_name || user.email.split('@')[0],
            role: defaultRole,
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
        // Individual user defaults to Tier 1 unless upgraded
        if (!localStorage.getItem('cadence_user_tier')) {
          setTierState(1);
        }
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

  const isSuperAdmin = profile?.role === 'super_admin';
  const isOrgAdmin = profile?.role === 'org_admin' || isSuperAdmin;
  const isApproved = profile?.status === 'approved' || isOrgAdmin;
  const isIndividual = !profile?.org_id && !isSuperAdmin;

  // Normalized Access Level: 1 = Full, 2 = Limited, 3 = View Only
  const accessLevel: 1 | 2 | 3 = (() => {
    if (isOrgAdmin || profile?.role === 'level_1' || profile?.role === 'senior_manager') return 1;
    if (profile?.role === 'level_2' || profile?.role === 'junior_manager' || profile?.role === 'editor' || profile?.role === 'manager') return 2;
    return 3;
  })();

  const hasFeature = (feature: FeatureKey): boolean => {
    if (isOrgAdmin) return true;
    
    // Tier-based access rules:
    if (feature === 'google_calendar_sync' && tierState < 2) return false;
    if (feature === 'advanced_reports' && tierState < 2) return false;
    if (feature === 'admin_management' && tierState < 3) return false;

    if (entitlements[feature] !== undefined) return entitlements[feature];
    if (organization?.features && (organization.features as any)[feature] !== undefined) {
      return (organization.features as any)[feature];
    }
    return true;
  };

  const hasRole = (roles: UserRole[]): boolean => {
    if (!profile) return false;
    if (profile.role === 'super_admin' || profile.role === 'org_admin') return true;
    return roles.includes(profile.role);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        organization,
        team,
        isLoading,
        isSuperAdmin,
        isOrgAdmin,
        isApproved,
        isIndividual,
        tier: tierState,
        setTier,
        accessLevel,
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
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
