import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth, UserProfile, UserRole, UserStatus, FeatureKey } from '../../context/AuthContext';
import { ShieldCheck, UserCheck, UserX, ToggleLeft, ToggleRight, CheckCircle2, Clock, ShieldAlert, Sparkles, Filter, Search, Layers, Check, X } from 'lucide-react';

interface FeatureDef {
  key: FeatureKey;
  name: string;
  description: string;
}

const INITIAL_DEMO_PROFILES: UserProfile[] = [
  {
    id: 'demo-user-1',
    email: 'merchandiser@apache.com',
    full_name: 'Alex Merchandiser',
    avatar_url: null,
    department: 'Production',
    role: 'admin',
    status: 'approved',
    approved_at: '2026-08-20T10:00:00.000Z',
  },
  {
    id: 'demo-user-2',
    email: 'supplier-x@footwear.com',
    full_name: 'Supplier X Contact',
    avatar_url: null,
    department: 'Materials',
    role: 'viewer',
    status: 'pending',
    approved_at: null,
  },
  {
    id: 'demo-user-3',
    email: 'qa-manager@apache.com',
    full_name: 'QA Auditor',
    avatar_url: null,
    department: 'Quality Audit',
    role: 'editor',
    status: 'approved',
    approved_at: '2026-08-21T14:30:00.000Z',
  },
];

const INITIAL_USER_FEATURES: Record<string, Record<FeatureKey, boolean>> = {
  'demo-user-1': { base_tier: true, node_mutation: true, google_calendar_sync: true, advanced_reports: true, admin_management: true },
  'demo-user-2': { base_tier: true, node_mutation: false, google_calendar_sync: false, advanced_reports: false, admin_management: false },
  'demo-user-3': { base_tier: true, node_mutation: true, google_calendar_sync: true, advanced_reports: false, admin_management: false },
};

const FEATURE_LIST: FeatureDef[] = [
  { key: 'base_tier', name: 'Base Timeline', description: 'Browse milestone tree and action feeds' },
  { key: 'node_mutation', name: 'Edit & Create Tasks', description: 'Create tasks and shift target dates' },
  { key: 'google_calendar_sync', name: 'Google Cal Sync', description: 'Export & 2-way Google Calendar OAuth sync' },
  { key: 'advanced_reports', name: 'Variance Reports', description: 'Bottleneck and critical path analytics' },
];

export const AdminDashboard: React.FC = () => {
  const { refreshProfile } = useAuth();
  
  const [profiles, setProfiles] = useState<UserProfile[]>(() => {
    const saved = localStorage.getItem('cadence_admin_profiles');
    return saved ? JSON.parse(saved) : INITIAL_DEMO_PROFILES;
  });

  const [userFeatures, setUserFeatures] = useState<Record<string, Record<FeatureKey, boolean>>>(() => {
    const saved = localStorage.getItem('cadence_admin_user_features');
    return saved ? JSON.parse(saved) : INITIAL_USER_FEATURES;
  });

  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'revoked'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    localStorage.setItem('cadence_admin_profiles', JSON.stringify(profiles));
  }, [profiles]);

  useEffect(() => {
    localStorage.setItem('cadence_admin_user_features', JSON.stringify(userFeatures));
  }, [userFeatures]);

  const loadData = async () => {
    try {
      const { data: profs } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      if (profs && profs.length > 0) {
        setProfiles(profs);
      }
    } catch {
      // Keep local state
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleUpdateStatus = async (targetId: string, status: UserStatus, role?: UserRole) => {
    try {
      await supabase.rpc('admin_set_user_status', {
        p_target_user_id: targetId,
        p_new_status: status,
        p_assigned_role: role || 'viewer',
      });
    } catch {
      // Local fallback
    }

    setProfiles(prev => prev.map(p => {
      if (p.id === targetId) {
        return {
          ...p,
          status,
          role: role || p.role,
          approved_at: status === 'approved' ? new Date().toISOString() : null,
        };
      }
      return p;
    }));

    refreshProfile();
  };

  const handleToggleFeature = async (targetId: string, featureKey: FeatureKey) => {
    const currentVal = userFeatures[targetId]?.[featureKey] || false;
    const newVal = !currentVal;

    try {
      await supabase.rpc('admin_toggle_feature_entitlement', {
        p_target_user_id: targetId,
        p_feature_key: featureKey,
        p_enabled: newVal,
      });
    } catch {
      // Local fallback
    }

    setUserFeatures(prev => ({
      ...prev,
      [targetId]: {
        ...prev[targetId],
        [featureKey]: newVal,
      },
    }));
  };

  const filteredProfiles = profiles.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return p.email.toLowerCase().includes(q) || (p.full_name && p.full_name.toLowerCase().includes(q));
    }
    return true;
  });

  const pendingCount = profiles.filter(p => p.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-slate-800">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30 mb-2">
            <ShieldCheck className="w-3.5 h-3.5" /> Admin Security Center
          </div>
          <h1 className="text-xl md:text-2xl font-black tracking-tight">Access Control & Modular Subscriptions</h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1 max-w-xl">
            Approve registered accounts, assign RBAC permissions, and toggle premium modular feature flags per user.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-slate-800 px-4 py-2.5 rounded-2xl border border-slate-700 text-center min-w-[100px]">
            <span className="text-xl font-extrabold text-amber-400 block font-mono">{pendingCount}</span>
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Pending</span>
          </div>
          <div className="bg-slate-800 px-4 py-2.5 rounded-2xl border border-slate-700 text-center min-w-[100px]">
            <span className="text-xl font-extrabold text-emerald-400 block font-mono">{profiles.filter(p => p.status === 'approved').length}</span>
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Approved</span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search accounts by email or name..."
            className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-teal-500"
          />
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl font-semibold transition-colors ${
              statusFilter === 'all' ? 'bg-slate-900 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            All Accounts ({profiles.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('pending')}
            className={`px-3 py-1.5 rounded-xl font-semibold transition-colors ${
              statusFilter === 'pending' ? 'bg-amber-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Pending ({pendingCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('approved')}
            className={`px-3 py-1.5 rounded-xl font-semibold transition-colors ${
              statusFilter === 'approved' ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Approved
          </button>
        </div>
      </div>

      {/* User Directory Table */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-2xs overflow-hidden">
        <div className="p-4 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-teal-600" /> User Directory & Modular Subscriptions
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3">User / Account</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Modular Feature Entitlements</th>
                <th className="px-4 py-3 text-right">Access Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredProfiles.map(prof => {
                const userFeats = userFeatures[prof.id] || { base_tier: true, node_mutation: true, google_calendar_sync: false, advanced_reports: false, admin_management: false };

                return (
                  <tr key={prof.id} className="hover:bg-gray-50/60 transition-colors">
                    
                    {/* User Info */}
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-gray-900">{prof.full_name || 'Registered User'}</div>
                      <div className="text-[11px] text-gray-500 font-mono">{prof.email}</div>
                    </td>

                    {/* Role Selector */}
                    <td className="px-4 py-3.5">
                      <select
                        value={prof.role}
                        onChange={e => handleUpdateStatus(prof.id, prof.status, e.target.value as UserRole)}
                        className="px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold shadow-2xs outline-none focus:border-teal-500"
                      >
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </td>

                    {/* Status Badge */}
                    <td className="px-4 py-3.5">
                      {prof.status === 'approved' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-bold border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" /> Approved
                        </span>
                      ) : prof.status === 'pending' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-amber-50 text-amber-800 px-2.5 py-1 rounded-full font-bold border border-amber-200">
                          <Clock className="w-3 h-3 animate-pulse" /> Pending Approval
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-rose-50 text-rose-700 px-2.5 py-1 rounded-full font-bold border border-rose-200">
                          <ShieldAlert className="w-3 h-3" /> Revoked
                        </span>
                      )}
                    </td>

                    {/* Modular Feature Toggles */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {FEATURE_LIST.map(f => {
                          const isEnabled = Boolean(userFeats[f.key]);
                          return (
                            <button
                              key={f.key}
                              type="button"
                              onClick={() => handleToggleFeature(prof.id, f.key)}
                              title={`${f.name}: ${f.description}`}
                              className={`px-2.5 py-1 rounded-xl text-[10px] font-semibold border flex items-center gap-1 transition-all ${
                                isEnabled
                                  ? 'bg-teal-50 text-teal-800 border-teal-300 shadow-2xs'
                                  : 'bg-gray-100 text-gray-400 border-gray-200 hover:text-gray-600'
                              }`}
                            >
                              <span>{f.name}</span>
                              {isEnabled ? <ToggleRight className="w-3.5 h-3.5 text-teal-600" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                            </button>
                          );
                        })}
                      </div>
                    </td>

                    {/* Vertically Aligned Action Buttons */}
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex flex-col items-end gap-1.5">
                        {prof.status !== 'approved' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(prof.id, 'approved')}
                            className="w-24 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition-colors shadow-2xs flex items-center justify-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" /> Approve
                          </button>
                        )}
                        {prof.status !== 'revoked' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(prof.id, 'revoked')}
                            className="w-24 px-3 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl font-bold text-xs transition-colors border border-rose-200 flex items-center justify-center gap-1"
                          >
                            <X className="w-3.5 h-3.5" /> Revoke
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
