import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth, UserProfile, UserRole, UserStatus, FeatureKey, Team, Organization } from '../../context/AuthContext';
import { 
  ShieldCheck, Layers, Plus, Check, X, Search, Clock, CheckCircle2, 
  ShieldAlert, Users, FolderTree, ToggleLeft, ToggleRight, Bell, Download, 
  Trash2, FileSpreadsheet, HardDrive, Edit3, Palette, Settings
} from 'lucide-react';

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

interface OrgAdminDashboardProps {
  currentSection?: 'teams' | 'users' | 'features' | 'backup';
}

export const OrgAdminDashboard: React.FC<OrgAdminDashboardProps> = ({ currentSection = 'users' }) => {
  const { profile, organization, refreshProfile } = useAuth();
  
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

  // Edit Company Settings Modal
  const [showEditSettingsModal, setShowEditSettingsModal] = useState(false);
  const [editBrandTitle, setEditBrandTitle] = useState('');
  const [editBrandTagline, setEditBrandTagline] = useState('');
  const [editLogoUrl, setEditLogoUrl] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: teamsData } = await supabase
        .from('teams')
        .select('*')
        .order('name', { ascending: true });

      setTeams(teamsData || []);

      const { data: profs } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

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

  const openSettingsModal = () => {
    setEditBrandTitle(organization?.brand_title || `Cadence - ${organization?.name || 'Company'}`);
    setEditBrandTagline(organization?.brand_tagline || 'Enterprise Ex-Factory CPM Tracker');
    setEditLogoUrl(organization?.logo_url || '');
    setShowEditSettingsModal(true);
  };

  const handleSaveCompanySettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id) return;

    try {
      const { error } = await supabase
        .from('organizations')
        .update({
          brand_title: editBrandTitle.trim(),
          brand_tagline: editBrandTagline.trim(),
          logo_url: editLogoUrl.trim() || null,
        })
        .eq('id', organization.id);

      if (error) throw error;

      setShowEditSettingsModal(false);
      await refreshProfile();
      await loadData();
    } catch (err: any) {
      alert('Error saving company settings: ' + err.message);
    }
  };

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

  // Export Organization Data Backup
  const handleDownloadOrgBackup = async () => {
    try {
      const orgId = profile?.org_id || '00000000-0000-0000-0000-000000000001';
      const [nodesRes, remsRes, teamsRes, profsRes] = await Promise.all([
        supabase.from('nodes').select('*').eq('org_id', orgId),
        supabase.from('reminders').select('*'),
        supabase.from('teams').select('*').eq('org_id', orgId),
        supabase.from('profiles').select('*').eq('org_id', orgId),
      ]);

      const orgBackupData = {
        organization: organization?.name || 'Company Workspace',
        exported_at: new Date().toISOString(),
        nodes_count: nodesRes.data?.length || 0,
        teams_count: teamsRes.data?.length || 0,
        members_count: profsRes.data?.length || 0,
        data: {
          teams: teamsRes.data || [],
          nodes: nodesRes.data || [],
          reminders: remsRes.data || [],
          members: profsRes.data || [],
        },
      };

      const blob = new Blob([JSON.stringify(orgBackupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(organization?.name || 'company').toLowerCase().replace(/\s+/g, '_')}_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Failed to export organization backup: ' + err.message);
    }
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
      {/* Organization Header with Vertically Aligned Stack of Action Buttons */}
      <div className="bg-slate-900 text-white p-6 rounded-3xl border border-slate-800 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30 mb-2">
            <ShieldCheck className="w-3.5 h-3.5" /> Company Organization Admin
          </div>
          <h1 className="text-xl md:text-2xl font-black tracking-tight">Organization Control & Access Center</h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Manage company department hierarchy, approve registered employees, configure role levels, and export company data backups.
          </p>
        </div>

        {/* Clean Stacked Action Buttons */}
        <div className="flex flex-col sm:flex-row md:flex-col gap-2.5 w-full md:w-56 shrink-0">
          <button
            type="button"
            onClick={() => setShowAddTeamModal(true)}
            className="w-full h-10 px-4 bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-xl font-bold text-xs shadow-lg shadow-teal-500/20 transition-all flex items-center justify-center gap-2 shrink-0"
          >
            <Plus className="w-4 h-4" /> Add Team / Dept
          </button>
          
          <button
            type="button"
            onClick={openSettingsModal}
            className="w-full h-10 px-4 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-xl font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-2 shrink-0"
          >
            <Edit3 className="w-4 h-4 text-teal-400" /> Edit Company Info
          </button>
          
          <button
            type="button"
            onClick={handleDownloadOrgBackup}
            className="w-full h-10 px-4 bg-slate-850 hover:bg-slate-800 text-slate-300 border border-slate-750 rounded-xl font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-2 shrink-0"
          >
            <Download className="w-4 h-4 text-teal-400" /> Export Backup
          </button>
        </div>
      </div>

      {/* PENDING APPROVAL NOTIFICATION BANNER */}
      {pendingCount > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-3xl text-amber-200 flex items-center justify-between gap-4 shadow-sm animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30 shrink-0">
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
            className="h-9 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition-colors shrink-0"
          >
            Review Pending ({pendingCount})
          </button>
        </div>
      )}

      {/* DYNAMIC COMPANY ORG CHART / TEAMS DISPLAY */}
      {(currentSection === 'teams' || currentSection === 'users' || !currentSection) && (
        <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-2xs space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
            <FolderTree className="w-4 h-4 text-teal-600" /> Company Org Structure ({teams.length} Teams / Departments)
          </h3>

          {teams.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No custom teams created yet. Click "Add Team / Dept" above.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {teams.map(t => {
                const parent = teams.find(p => p.id === t.parent_team_id);
                const membersCount = profiles.filter(p => p.team_id === t.id).length;

                return (
                  <div key={t.id} className="p-3.5 bg-gray-50 border border-gray-200 rounded-2xl space-y-1">
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
                      👥 {membersCount} Assigned Employee{membersCount === 1 ? '' : 's'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* User Directory Table */}
      {(currentSection === 'users' || !currentSection) && (
        <div className="bg-white rounded-3xl border border-gray-200 shadow-2xs overflow-hidden">
          <div className="p-4 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-teal-600" /> Employee Accounts & Inherited Team Assignments
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
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-gray-900">{prof.full_name || 'Registered Employee'}</div>
                        <div className="text-[11px] text-gray-500 font-mono">{prof.email}</div>
                      </td>

                      <td className="px-4 py-3.5">
                        <select
                          value={prof.team_id || ''}
                          onChange={e => handleUpdateStatus(prof.id, prof.status, prof.role, e.target.value || undefined)}
                          className="h-8 px-2.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold shadow-2xs outline-none focus:border-teal-500 max-w-[160px]"
                        >
                          <option value="">No Team Assigned</option>
                          {teams.map(t => (
                            <option key={t.id} value={t.id}>
                              {t.name} (L{t.level_depth})
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="px-4 py-3.5">
                        <select
                          value={prof.role}
                          onChange={e => handleUpdateStatus(prof.id, prof.status, e.target.value as UserRole, prof.team_id || undefined)}
                          className="h-8 px-2.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold shadow-2xs outline-none focus:border-teal-500"
                        >
                          <option value="org_admin">Org Admin (Full Access)</option>
                          <option value="senior_manager">Senior Manager (Inherited Access)</option>
                          <option value="junior_manager">Junior Manager (Scoped Access)</option>
                          <option value="viewer">Viewer (Read-Only)</option>
                        </select>
                      </td>

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

                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {prof.status !== 'approved' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(prof.id, 'approved', prof.role, prof.team_id || undefined)}
                              className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition-colors shadow-2xs flex items-center justify-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" /> Approve
                            </button>
                          )}
                          {prof.status !== 'revoked' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(prof.id, 'revoked', prof.role, prof.team_id || undefined)}
                              className="h-8 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl font-bold text-xs transition-colors border border-rose-200 flex items-center justify-center gap-1"
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
      )}

      {/* COMPANY BACKUP PANEL */}
      {currentSection === 'backup' && (
        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/10 text-teal-600 flex items-center justify-center border border-teal-500/20">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Company Data Backup & Export Center</h2>
              <p className="text-xs text-gray-500">
                Download and archive your organization's milestone hierarchy, teams, and employee directories.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDownloadOrgBackup}
            className="h-10 px-5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> Download Company JSON Backup
          </button>
        </div>
      )}

      {/* EDIT COMPANY SETTINGS MODAL */}
      {showEditSettingsModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-gray-200 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-teal-600" />
                <span>Edit Company Information & Logo</span>
              </h2>
              <button onClick={() => setShowEditSettingsModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <form onSubmit={handleSaveCompanySettings} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-gray-800 mb-1">Company Display Title</label>
                <input
                  type="text"
                  required
                  value={editBrandTitle}
                  onChange={e => setEditBrandTitle(e.target.value)}
                  placeholder="e.g. Cadence - Apache Footwear"
                  className="w-full h-9 px-3 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:border-teal-500 font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-800 mb-1">Company Tagline</label>
                <input
                  type="text"
                  value={editBrandTagline}
                  onChange={e => setEditBrandTagline(e.target.value)}
                  placeholder="e.g. adidas Ex-Factory Production Critical Path Tracker"
                  className="w-full h-9 px-3 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-800 mb-1">Company Logo URL</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={editLogoUrl}
                    onChange={e => setEditLogoUrl(e.target.value)}
                    placeholder="https://example.com/logo.png"
                    className="flex-1 h-9 px-3 bg-gray-50 border border-gray-300 rounded-xl font-mono outline-none focus:border-teal-500"
                  />
                  {editLogoUrl && (
                    <div className="w-9 h-9 border border-gray-200 rounded-xl flex items-center justify-center p-1 bg-white shrink-0">
                      <img src={editLogoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditSettingsModal(false)}
                  className="h-9 px-4 text-gray-600 font-semibold rounded-xl hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-9 px-4 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-2xs"
                >
                  Save Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                  className="w-full h-9 px-3 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Parent Team (Optional for Level 1)</label>
                <select
                  value={newParentTeamId}
                  onChange={e => setNewParentTeamId(e.target.value)}
                  className="w-full h-9 px-3 bg-white border border-gray-300 rounded-xl outline-none focus:border-teal-500 font-semibold"
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
                  className="h-9 px-4 text-gray-600 font-semibold rounded-xl hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-9 px-4 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-2xs"
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
