import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth, UserProfile, UserRole, UserStatus, FeatureKey, Team } from '../../context/AuthContext';
import { ShieldCheck, Layers, Plus, Check, X, Search, Clock, CheckCircle2, ShieldAlert, Users, FolderTree, ToggleLeft, ToggleRight, Bell } from 'lucide-react';

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

export const OrgAdminDashboard: React.FC = () => {
  const { profile, refreshProfile } = useAuth();
  
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [userFeatures, setUserFeatures] = useState<Record<string, Record<FeatureKey, boolean>>>({});
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'revoked'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Team creation state
  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newParentTeamId, setNewParentTeamId] = useState<string>('');

  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch teams for organization
      const { data: teamsData } = await supabase
        .from('teams')
        .select('*')
        .order('name', { ascending: true });

      setTeams(teamsData || []);

      // Fetch profiles
      const { data: profs } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      // Fetch feature entitlements
      const { data: entitlements } = await supabase
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
      console.error('Failed to load org admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;

    try {
      const parentTeam = teams.find(t => t.id === newParentTeamId);
      const newTeam = {
        org_id: profile?.org_id || '00000000-0000-0000-0000-000000000001',
        parent_team_id: newParentTeamId || null,
        name: newTeamName.trim(),
        level_depth: parentTeam ? parentTeam.level_depth + 1 : 1,
      };

      const { error } = await supabase.from('teams').insert(newTeam);
      if (error) throw error;

      setNewTeamName('');
      setNewParentTeamId('');
      setShowAddTeamModal(false);
      await loadData();
    } catch (err: any) {
      alert('Error creating team: ' + err.message);
    }
  };

  const handleUpdateStatus = async (targetId: string, status: UserStatus, role?: UserRole, teamId?: string) => {
    try {
      await supabase
        .from('profiles')
        .update({
          status,
          role: role || 'junior_manager',
          team_id: teamId !== undefined ? teamId : undefined,
          approved_at: status === 'approved' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetId);
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
      await supabase.from('user_feature_entitlements').upsert({
        user_id: targetId,
        feature_key: featureKey,
        enabled: newVal,
      });
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
      {/* Organization Header */}
      <div className="bg-slate-900 text-white p-6 rounded-3xl border border-slate-800 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30 mb-2">
            <ShieldCheck className="w-3.5 h-3.5" /> Organization Admin Center
          </div>
          <h1 className="text-xl md:text-2xl font-black tracking-tight">Company Management Hierarchy & Access Control</h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1 max-w-xl">
            Build your company's custom department/team tree and assign employee accounts with team-level inherited task access.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowAddTeamModal(true)}
            className="px-3.5 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-2xl font-bold text-xs shadow-lg shadow-teal-500/20 transition-all flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Add Team / Department
          </button>
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
                New team members are awaiting your access approval and team assignment.
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

      {/* DYNAMIC COMPANY ORG CHART / TEAMS DISPLAY */}
      <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-2xs space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
          <FolderTree className="w-4 h-4 text-teal-600" /> Company Org Structure ({teams.length} Teams / Departments)
        </h3>

        {teams.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No custom teams created yet. Click "Add Team / Department" above.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {teams.map(t => {
              const parent = teams.find(p => p.id === t.parent_team_id);
              const membersCount = profiles.filter(p => p.team_id === t.id).length;

              return (
                <div key={t.id} className="p-3 bg-gray-50 border border-gray-200 rounded-2xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-900 text-xs">{t.name}</span>
                    <span className="text-[10px] bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full font-mono font-bold">
                      Level {t.level_depth}
                    </span>
                  </div>
                  {parent && (
                    <div className="text-[10px] text-gray-500">Parent: {parent.name}</div>
                  )}
                  <div className="text-[11px] text-gray-600 font-semibold pt-1">
                    👥 {membersCount} Assigned User{membersCount === 1 ? '' : 's'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* User Directory Table */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-2xs overflow-hidden">
        <div className="p-4 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-teal-600" /> User Accounts & Inherited Team Assignments
          </h2>
          {loading && <span className="text-xs text-gray-400 animate-pulse">Syncing DB...</span>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3">User / Account</th>
                <th className="px-4 py-3">Assigned Team / Level</th>
                <th className="px-4 py-3">Role Level</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Feature Flags</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredProfiles.map(prof => {
                const userFeats = userFeatures[prof.id] || { base_tier: true, node_mutation: true, google_calendar_sync: false, advanced_reports: false, admin_management: false };

                return (
                  <tr key={prof.id} className="hover:bg-gray-50/60 transition-colors">
                    {/* User Info */}
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-gray-900">{prof.full_name || 'Registered Employee'}</div>
                      <div className="text-[11px] text-gray-500 font-mono">{prof.email}</div>
                    </td>

                    {/* Team Selector */}
                    <td className="px-4 py-3.5">
                      <select
                        value={prof.team_id || ''}
                        onChange={e => handleUpdateStatus(prof.id, prof.status, prof.role, e.target.value || undefined)}
                        className="px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold shadow-2xs outline-none focus:border-teal-500 max-w-[160px]"
                      >
                        <option value="">No Team Assigned</option>
                        {teams.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.name} (L{t.level_depth})
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Role Level Selector */}
                    <td className="px-4 py-3.5">
                      <select
                        value={prof.role}
                        onChange={e => handleUpdateStatus(prof.id, prof.status, e.target.value as UserRole, prof.team_id || undefined)}
                        className="px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold shadow-2xs outline-none focus:border-teal-500"
                      >
                        <option value="org_admin">Org Admin (Full Access)</option>
                        <option value="senior_manager">Senior Manager (Inherited Access)</option>
                        <option value="junior_manager">Junior Manager (Scoped Access)</option>
                        <option value="viewer">Viewer (Read-Only)</option>
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
                      <div className="flex items-center gap-1 flex-wrap">
                        {FEATURE_LIST.map(f => {
                          const isEnabled = Boolean(userFeats[f.key]);
                          return (
                            <button
                              key={f.key}
                              type="button"
                              onClick={() => handleToggleFeature(prof.id, f.key)}
                              className={`px-2 py-0.5 rounded-lg text-[9px] font-semibold border flex items-center gap-1 ${
                                isEnabled ? 'bg-teal-50 text-teal-800 border-teal-300' : 'bg-gray-100 text-gray-400 border-gray-200'
                              }`}
                            >
                              <span>{f.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex flex-col items-end gap-1.5">
                        {prof.status !== 'approved' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(prof.id, 'approved', prof.role, prof.team_id || undefined)}
                            className="w-24 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition-colors shadow-2xs flex items-center justify-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" /> Approve
                          </button>
                        )}
                        {prof.status !== 'revoked' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(prof.id, 'revoked', prof.role, prof.team_id || undefined)}
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

      {/* Add Team Modal */}
      {showAddTeamModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-gray-200 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Add Team or Department to Org Chart</h2>
            
            <form onSubmit={handleCreateTeam} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Team / Department Name</label>
                <input
                  type="text"
                  required
                  value={newTeamName}
                  onChange={e => setNewTeamName(e.target.value)}
                  placeholder="e.g. Stitching Line A"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Parent Team (Optional for Level 1)</label>
                <select
                  value={newParentTeamId}
                  onChange={e => setNewParentTeamId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl outline-none focus:border-teal-500 font-semibold"
                >
                  <option value="">Top-Level Department (Level 1)</option>
                  {teams.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} (Level {t.level_depth})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddTeamModal(false)}
                  className="px-4 py-2 text-gray-600 font-semibold rounded-xl hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-2xs"
                >
                  Create Team
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
