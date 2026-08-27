import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth, UserProfile, UserRole, UserStatus, FeatureKey } from '../../context/AuthContext';
import { ShieldCheck, UserCheck, UserX, ToggleLeft, ToggleRight, CheckCircle2, Clock, ShieldAlert, Sparkles, Filter, Search, Layers, Check, X, Bell, Trash2 } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useDialog } from '../../context/DialogContext';

interface FeatureDef {
  key: FeatureKey;
  name: string;
  description: string;
}

const FEATURE_LIST: FeatureDef[] = [
  { key: 'base_tier', name: 'Base Timeline', description: 'Browse milestone tree and action feeds' },
  { key: 'node_mutation', name: 'Edit & Create Tasks', description: 'Create tasks and shift target dates' },
  { key: 'google_calendar_sync', name: 'Google Cal Sync', description: 'Export & 2-way Google Calendar OAuth sync' },
  { key: 'advanced_reports', name: 'Variance Reports', description: 'Bottleneck and critical path analytics' },
];

export const AdminDashboard: React.FC = () => {
  const { refreshProfile } = useAuth();
  const toast = useToast();
  const { confirm } = useDialog();
  
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [userFeatures, setUserFeatures] = useState<Record<string, Record<FeatureKey, boolean>>>({});
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'revoked'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch live profiles from Supabase Cloud DB
      const { data: profs, error: pErr } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (pErr) throw pErr;

      // 2. Fetch live entitlements overrides
      const { data: entitlements, error: eErr } = await supabase
        .from('user_feature_entitlements')
        .select('*');

      const featureMap: Record<string, Record<FeatureKey, boolean>> = {};
      if (entitlements) {
        for (const item of entitlements) {
          if (!featureMap[item.user_id]) {
            featureMap[item.user_id] = {
              base_tier: true,
              node_mutation: true,
              google_calendar_sync: false,
              advanced_reports: false,
              admin_management: false,
            };
          }
          featureMap[item.user_id][item.feature_key as FeatureKey] = item.enabled;
        }
      }

      setProfiles(profs || []);
      setUserFeatures(featureMap);
    } catch (err) {
      console.error('Failed to load admin profiles from Supabase:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDeleteUser = async (targetId: string, email: string) => {
    const confirmed = await confirm({
      title: 'Delete User Account',
      message: `Permanently delete user account "${email}"? This cannot be undone.`,
      destructive: true,
      confirmLabel: 'Delete Account',
    });
    if (!confirmed) return;

    try {
      const { error } = await supabase.from('profiles').delete().eq('id', targetId);
      if (error) throw error;
      toast.success(`User "${email}" deleted successfully.`);
      await loadData();
    } catch (err: any) {
      console.error('Delete user error:', err);
      toast.error(`Failed to delete user: ${err.message}`);
    }
  };

  const handleUpdateStatus = async (targetId: string, status: UserStatus, role?: UserRole) => {
    try {
      const { error } = await supabase.rpc('admin_set_user_status', {
        p_target_user_id: targetId,
        p_new_status: status,
        p_assigned_role: role || 'viewer',
      });

      if (error) {
        // Fallback update if RPC not present in DB
        await supabase
          .from('profiles')
          .update({
            status,
            role: role || 'viewer',
            approved_at: status === 'approved' ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', targetId);
      }
    } catch (err) {
      console.error('Update status error:', err);
    }

    await loadData();
    await refreshProfile();
  };

  const handleToggleFeature = async (targetId: string, featureKey: FeatureKey) => {
    const currentVal = userFeatures[targetId]?.[featureKey] || false;
    const newVal = !currentVal;

    try {
      const { error } = await supabase.rpc('admin_toggle_feature_entitlement', {
        p_target_user_id: targetId,
        p_feature_key: featureKey,
        p_enabled: newVal,
      });

      if (error) {
        await supabase.from('user_feature_entitlements').upsert({
          user_id: targetId,
          feature_key: featureKey,
          enabled: newVal,
        });
      }
    } catch (err) {
      console.error('Toggle feature error:', err);
    }

    await loadData();
  };

  const filteredProfiles = profiles.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return p.email.toLowerCase().includes(q) || (p.full_name && p.full_name.toLowerCase().includes(q));
    }
    return true;
  });

  const pendingProfiles = profiles.filter(p => p.status === 'pending');
  const pendingCount = pendingProfiles.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[var(--sidebar-bg)] text-white p-6 rounded-3xl shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-[var(--sidebar-border)]">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30 mb-2">
            <ShieldCheck className="w-3.5 h-3.5" /> Admin Security Center
          </div>
          <h1 className="text-xl md:text-2xl font-black tracking-tight">Access Control & Modular Subscriptions</h1>
          <p className="text-xs md:text-sm text-[var(--sidebar-text-muted)] mt-1 max-w-xl">
            Approve registered accounts, assign RBAC permissions, and toggle premium modular feature flags per user.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-[var(--sidebar-hover)] px-4 py-2.5 rounded-2xl border border-[var(--sidebar-border)] text-center min-w-[100px]">
            <span className="text-xl font-extrabold text-amber-400 block font-mono">{pendingCount}</span>
            <span className="text-[10px] text-[var(--sidebar-text-muted)] uppercase font-semibold">Pending</span>
          </div>
          <div className="bg-[var(--sidebar-hover)] px-4 py-2.5 rounded-2xl border border-[var(--sidebar-border)] text-center min-w-[100px]">
            <span className="text-xl font-extrabold text-emerald-400 block font-mono">{profiles.filter(p => p.status === 'approved').length}</span>
            <span className="text-[10px] text-[var(--sidebar-text-muted)] uppercase font-semibold">Approved</span>
          </div>
        </div>
      </div>

      {/* PROMINENT PENDING APPROVAL NOTIFICATION BANNER */}
      {pendingCount > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl text-amber-200 flex items-center justify-between gap-4 shadow-sm animate-in fade-in duration-150">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30 shrink-0">
              <Bell className="w-5 h-5 animate-bounce" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-300">
                Action Required: {pendingCount} Pending User Registration{pendingCount > 1 ? 's' : ''}
              </h3>
              <p className="text-xs text-amber-200/80">
                New team members are awaiting your access approval and module tier assignment.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setStatusFilter('pending')}
            className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition-colors shrink-0"
          >
            Review Pending ({pendingCount})
          </button>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-[var(--card-bg)] p-4 rounded-2xl border border-[var(--border)] shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search accounts by email or name..."
            className="w-full pl-8 pr-3 py-1.5 bg-[var(--badge-bg)] border border-[var(--border)] rounded-xl outline-none focus:border-teal-500"
          />
          <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-2.5" />
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl font-semibold transition-colors ${
              statusFilter === 'all' ? 'bg-[var(--sidebar-bg)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--badge-bg)]'
            }`}
          >
            All Accounts ({profiles.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('pending')}
            className={`px-3 py-1.5 rounded-xl font-semibold transition-colors ${
              statusFilter === 'pending' ? 'bg-amber-600 text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--badge-bg)]'
            }`}
          >
            Pending ({pendingCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('approved')}
            className={`px-3 py-1.5 rounded-xl font-semibold transition-colors ${
              statusFilter === 'approved' ? 'bg-emerald-600 text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--badge-bg)]'
            }`}
          >
            Approved
          </button>
        </div>
      </div>

      {/* User Directory Table */}
      <div className="bg-[var(--card-bg)] rounded-3xl border border-[var(--border)] shadow-2xs overflow-hidden">
        <div className="p-4 bg-[var(--badge-bg)] border-b border-[var(--border-subtle)] flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-teal-600" /> Live Supabase User Directory & Modular Subscriptions
          </h2>
          {loading && <span className="text-xs text-[var(--text-muted)] animate-pulse">Syncing Supabase DB...</span>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--badge-bg)] border-b border-[var(--border)] text-[var(--text-secondary)] font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3">User / Account</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Modular Feature Entitlements</th>
                <th className="px-4 py-3 text-right">Access Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {filteredProfiles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[var(--text-muted)] italic text-xs">
                    No registered user accounts matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredProfiles.map(prof => {
                  const userFeats = userFeatures[prof.id] || { base_tier: true, node_mutation: true, google_calendar_sync: false, advanced_reports: false, admin_management: false };

                  return (
                    <tr key={prof.id} className="hover:bg-[var(--badge-bg)]/60 transition-colors">
                      
                      {/* User Info */}
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-[var(--text-primary)]">{prof.full_name || 'Registered User'}</div>
                        <div className="text-[11px] text-[var(--text-muted)] font-mono">{prof.email}</div>
                      </td>

                      {/* Role Selector */}
                      <td className="px-4 py-3.5">
                        <select
                          value={prof.role}
                          onChange={e => handleUpdateStatus(prof.id, prof.status, e.target.value as UserRole)}
                          className="px-2.5 py-1.5 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl text-xs font-semibold shadow-2xs outline-none focus:border-teal-500"
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
                                    : 'bg-[var(--badge-bg)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text-primary)]'
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
                        <div className="flex items-center justify-end gap-1.5">
                          {prof.status !== 'approved' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(prof.id, 'approved')}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition-colors shadow-2xs flex items-center justify-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" /> Approve
                            </button>
                          )}
                          {prof.status !== 'revoked' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(prof.id, 'revoked')}
                              className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl font-bold text-xs transition-colors border border-amber-200 flex items-center justify-center gap-1"
                            >
                              <X className="w-3.5 h-3.5" /> Revoke
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(prof.id, prof.email)}
                            title="Delete User Account"
                            className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl font-bold text-xs transition-colors border border-rose-200 flex items-center justify-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
