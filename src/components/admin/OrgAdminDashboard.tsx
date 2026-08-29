import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth, UserProfile, UserRole, UserStatus, FeatureKey, Team, Organization } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useDialog } from '../../context/DialogContext';
import { 
  ShieldCheck, Layers, Plus, Check, X, Search, Clock, CheckCircle2, 
  ShieldAlert, Users, FolderTree, ToggleLeft, ToggleRight, Bell, Download, 
  Trash2, HardDrive, Edit3, Settings, Sparkles, Sliders, ChevronRight, UserPlus,
  KeyRound, Copy, Mail, Lock, User
} from 'lucide-react';

interface FeatureDef {
  key: FeatureKey;
  name: string;
  description: string;
}

const FEATURE_LIST: FeatureDef[] = [
  { key: 'base_tier', name: 'Timeline Navigation', description: 'Browse milestone hierarchy tree and schedule views' },
  { key: 'node_mutation', name: 'Task Creation & Editing', description: 'Create new milestones and shift target dates' },
  { key: 'advanced_reports', name: 'Critical Path Reports', description: 'Variance reports and bottleneck diagnostics' },
];

interface CreatedEmployeeInfo {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  teamName: string;
}

interface OrgAdminDashboardProps {
  currentSection?: 'teams' | 'users' | 'features' | 'backup';
}

export const OrgAdminDashboard: React.FC<OrgAdminDashboardProps> = ({ currentSection = 'users' }) => {
  const { profile, organization, refreshProfile } = useAuth();
  const toast = useToast();
  const { confirm, showInfo } = useDialog();
  
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [userFeatures, setUserFeatures] = useState<Record<string, Record<FeatureKey, boolean>>>({});
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'revoked'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Team Creation & Edit Modal
  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [newParentTeamId, setNewParentTeamId] = useState<string>('');
  const [newTeamDefaultRole, setNewTeamDefaultRole] = useState<UserRole>('level_2');

  // Employee Creation Modal (Direct Admin Provisioning)
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpEmail, setNewEmpEmail] = useState('');
  const [newEmpPassword, setNewEmpPassword] = useState('');
  const [newEmpTeamId, setNewEmpTeamId] = useState('');
  const [newEmpRole, setNewEmpRole] = useState<UserRole>('level_2');
  const [creatingEmployee, setCreatingEmployee] = useState(false);
  const [createdEmployee, setCreatedEmployee] = useState<CreatedEmployeeInfo | null>(null);
  const [copiedCreds, setCopiedCreds] = useState(false);

  // Permissions & Entitlements Modal for Employee
  const [managingUser, setManagingUser] = useState<UserProfile | null>(null);

  // Edit Company Settings Modal
  const [showEditSettingsModal, setShowEditSettingsModal] = useState(false);
  const [editBrandTitle, setEditBrandTitle] = useState('');
  const [editBrandTagline, setEditBrandTagline] = useState('');
  const [editLogoUrl, setEditLogoUrl] = useState('');

  const loadData = async () => {
    if (!profile?.org_id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // 1. Fetch only teams belonging to this specific organization
      const { data: teamsData } = await supabase
        .from('teams')
        .select('*')
        .eq('org_id', profile.org_id)
        .order('level_depth', { ascending: true })
        .order('name', { ascending: true });

      setTeams(teamsData || []);

      // 2. Strict Scoping: Fetch ONLY profiles belonging to this organization and exclude Platform Super Admins
      const { data: profs } = await supabase
        .from('profiles')
        .select('*')
        .eq('org_id', profile.org_id)
        .not('role', 'in', '("super_admin","admin")')
        .order('created_at', { ascending: false });

      // 3. Fetch feature entitlements
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
  }, [profile?.org_id]);

  const copyTextToClipboard = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fallback
    }

    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch {
      return false;
    }
  };

  const generateDefaultPassword = () => {
    const orgCode = organization?.org_code || 'Cadence';
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return `${orgCode}@${randomNum}`;
  };

  const handleOpenAddEmployeeModal = () => {
    setNewEmpName('');
    setNewEmpEmail('');
    setNewEmpPassword(generateDefaultPassword());
    setNewEmpTeamId(teams[0]?.id || '');
    setNewEmpRole('level_2');
    setShowAddEmployeeModal(true);
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmpEmail.trim() || !newEmpPassword.trim() || !profile?.org_id) return;

    setCreatingEmployee(true);
    try {
      const cleanEmail = newEmpEmail.trim().toLowerCase();
      const cleanName = newEmpName.trim() || cleanEmail.split('@')[0];
      const assignedTeam = teams.find(t => t.id === newEmpTeamId);

      // 1. Sign up user account in Supabase Auth
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: cleanEmail,
        password: newEmpPassword.trim(),
        options: {
          data: {
            full_name: cleanName,
            workspace_code: organization?.org_code || '',
          },
        },
      });

      if (authErr) throw authErr;

      const userId = authData.user?.id;
      if (userId) {
        // 2. Pre-approve profile directly with selected team & role
        const { error: profErr } = await supabase.from('profiles').upsert({
          id: userId,
          org_id: profile.org_id,
          email: cleanEmail,
          full_name: cleanName,
          role: newEmpRole,
          team_id: newEmpTeamId || null,
          status: 'approved',
          approved_at: new Date().toISOString(),
        });

        if (profErr) throw profErr;
      }

      setCreatedEmployee({
        name: cleanName,
        email: cleanEmail,
        password: newEmpPassword.trim(),
        role: newEmpRole,
        teamName: assignedTeam ? assignedTeam.name : 'General',
      });

      setShowAddEmployeeModal(false);
      await loadData();
    } catch (err: any) {
      toast.error('Error creating employee account: ' + err.message);
    } finally {
      setCreatingEmployee(false);
    }
  };

  const copyEmployeeCredentials = async () => {
    if (!createdEmployee) return;
    const portalUrl = 'https://cadence-cpm.netlify.app';
    const msg = `Welcome to ${organization?.name || 'Company Workspace'} on Cadence CPM!\n\nYour employee login credentials:\n• Portal URL: ${portalUrl}\n• Workspace Code: ${organization?.org_code || 'APACHE'}\n• Login Email: ${createdEmployee.email}\n• Temporary Password: ${createdEmployee.password}\n• Assigned Role: ${createdEmployee.role.replace('_', ' ').toUpperCase()}\n• Department / Team: ${createdEmployee.teamName}\n\nPlease sign in directly at ${portalUrl} to access your tasks and timeline.`;

    const success = await copyTextToClipboard(msg);
    if (success) {
      setCopiedCreds(true);
      setTimeout(() => setCopiedCreds(false), 3000);
    } else {
      showInfo({ title: 'Employee Credentials', message: 'Copy the credentials below:', copyText: msg });
    }
  };

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
      toast.error('Error saving company settings: ' + err.message);
    }
  };

  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim() || !profile?.org_id) return;

    try {
      const parentTeam = teams.find(t => t.id === newParentTeamId);
      const teamPayload = {
        org_id: profile.org_id,
        parent_team_id: newParentTeamId || null,
        name: newTeamName.trim(),
        level_depth: parentTeam ? parentTeam.level_depth + 1 : 1,
        default_role: newTeamDefaultRole,
      };

      if (editingTeam) {
        const { error } = await supabase.from('teams').update(teamPayload).eq('id', editingTeam.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('teams').insert(teamPayload);
        if (error) throw error;
      }

      setNewTeamName('');
      setNewParentTeamId('');
      setEditingTeam(null);
      setShowAddTeamModal(false);
      await loadData();
    } catch (err: any) {
      toast.error('Error saving team: ' + err.message);
    }
  };

  const handleDeleteTeam = async (teamId: string, teamName: string) => {
    const ok = await confirm({
      title: 'Delete Team',
      message: `Are you sure you want to delete "${teamName}"? Any sub-teams will also be removed.`,
      destructive: true,
      confirmLabel: 'Delete Team',
    });
    if (!ok) return;

    try {
      await supabase.from('teams').delete().eq('id', teamId);
      await loadData();
    } catch (err: any) {
      toast.error('Error deleting team: ' + err.message);
    }
  };

  const handleUpdateStatus = async (targetId: string, status: UserStatus, role?: UserRole, teamId?: string) => {
    try {
      let assignedRole = role;
      if (teamId && !role) {
        const selectedTeam = teams.find(t => t.id === teamId);
        if (selectedTeam && (selectedTeam as any).default_role) {
          assignedRole = (selectedTeam as any).default_role as UserRole;
        }
      }

      await supabase
        .from('profiles')
        .update({
          status,
          role: assignedRole || 'level_2',
          team_id: teamId !== undefined ? (teamId || null) : undefined,
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

  const handleDownloadOrgBackup = async () => {
    try {
      const orgId = profile?.org_id;
      if (!orgId) return;

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
      toast.error('Failed to export organization backup: ' + err.message);
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
      {/* Company Header */}
      <div className="bg-[var(--sidebar-bg)] text-white p-6 rounded-3xl border border-[var(--sidebar-border)] shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30 mb-2">
            <ShieldCheck className="w-3.5 h-3.5" /> Company Organization Admin
          </div>
          <h1 className="text-xl md:text-2xl font-black tracking-tight">Organization Control & Access Center</h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Create employee login accounts, build your department structure, and manage Level 1/2/3 access permissions.
          </p>
        </div>

        {/* Clean Stacked Action Buttons */}
        <div className="flex flex-col sm:flex-row md:flex-col gap-2.5 w-full md:w-56 shrink-0">
          <button
            type="button"
            onClick={handleOpenAddEmployeeModal}
            className="w-full h-10 px-4 bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-xl font-bold text-xs shadow-lg shadow-teal-500/20 transition-all flex items-center justify-center gap-2 shrink-0"
          >
            <UserPlus className="w-4 h-4" /> Create Employee Account
          </button>
          
          <button
            type="button"
            onClick={() => {
              setEditingTeam(null);
              setNewTeamName('');
              setNewParentTeamId('');
              setNewTeamDefaultRole('level_2');
              setShowAddTeamModal(true);
            }}
            className="w-full h-10 px-4 bg-[var(--sidebar-hover)] hover:bg-[var(--sidebar-active)]/20 text-[var(--sidebar-text)] border border-[var(--sidebar-border)] rounded-xl font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-2 shrink-0"
          >
            <Plus className="w-4 h-4 text-teal-400" /> Add Team / Dept
          </button>

          <button
            type="button"
            onClick={openSettingsModal}
            className="w-full h-10 px-4 bg-[var(--sidebar-bg)] hover:bg-[var(--sidebar-hover)] text-[var(--sidebar-text)] border border-[var(--sidebar-border)] rounded-xl font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-2 shrink-0"
          >
            <Edit3 className="w-4 h-4 text-teal-400" /> Edit Company Info
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
                Action Required: {pendingCount} Pending Registration{pendingCount > 1 ? 's' : ''}
              </h3>
              <p className="text-xs text-amber-200/80">
                Users are awaiting your approval and team assignment.
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

      {/* VISUAL COMPANY ORG STRUCTURE & ACCESS LEVELS */}
      {(currentSection === 'teams' || currentSection === 'users' || !currentSection) && (
        <div className="bg-[var(--card-bg)] p-6 rounded-3xl border border-[var(--border)] shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
              <FolderTree className="w-4 h-4 text-teal-600" /> Company Hierarchy & Team Access Levels ({teams.length} Teams)
            </h3>
            <button
              type="button"
              onClick={() => {
                setEditingTeam(null);
                setNewTeamName('');
                setNewParentTeamId('');
                setNewTeamDefaultRole('level_2');
                setShowAddTeamModal(true);
              }}
              className="text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add Level
            </button>
          </div>

          {teams.length === 0 ? (
            <div className="p-8 text-center bg-[var(--badge-bg)] rounded-2xl border border-dashed border-[var(--border)] space-y-2">
              <FolderTree className="w-8 h-8 text-[var(--text-muted)] mx-auto" />
              <p className="text-xs font-semibold text-[var(--text-secondary)]">No departments or teams defined yet.</p>
              <p className="text-[11px] text-[var(--text-muted)] max-w-sm mx-auto">
                Create your company's departments (e.g. Production, Merchandising, Quality) and lines to assign access scopes to employees.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {teams.map(t => {
                const parent = teams.find(p => p.id === t.parent_team_id);
                const assignedEmployees = profiles.filter(p => p.team_id === t.id);

                return (
                  <div key={t.id} className="p-4 bg-[var(--badge-bg)]/80 border border-[var(--border)] rounded-2xl space-y-2 hover:border-teal-300 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[var(--text-primary)] text-xs truncate max-w-[170px]" title={t.name}>
                        {t.name}
                      </span>
                      <span className="text-[10px] bg-[var(--sidebar-bg)] text-teal-300 px-2 py-0.5 rounded-full font-mono font-bold">
                        Level {t.level_depth}
                      </span>
                    </div>

                    <div className="text-[11px] text-[var(--text-muted)]">
                      {parent ? <span>Parent: <strong className="text-[var(--text-secondary)]">{parent.name}</strong></span> : <span className="text-teal-700 font-semibold">Top-Level Division</span>}
                    </div>

                    <div className="pt-1 flex items-center justify-between text-[11px] border-t border-[var(--border)]/60">
                      <span className="font-mono text-[var(--text-secondary)] font-semibold">
                        👥 {assignedEmployees.length} Member{assignedEmployees.length === 1 ? '' : 's'}
                      </span>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTeam(t);
                            setNewTeamName(t.name);
                            setNewParentTeamId(t.parent_team_id || '');
                            setNewTeamDefaultRole(((t as any).default_role as UserRole) || 'level_2');
                            setShowAddTeamModal(true);
                          }}
                          className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--badge-bg)] transition-colors"
                          title="Edit Team & Access"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTeam(t.id, t.name)}
                          className="p-1 text-rose-500 hover:text-rose-700 rounded-lg hover:bg-rose-50 transition-colors"
                          title="Delete Team"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* STREAMLINED EMPLOYEE DIRECTORY TABLE */}
      {(currentSection === 'users' || !currentSection) && (
        <div className="bg-[var(--card-bg)] rounded-3xl border border-[var(--border)] shadow-2xs overflow-hidden">
          <div className="p-4 bg-[var(--badge-bg)] border-b border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
                <Users className="w-4 h-4 text-teal-600" /> Employee Accounts & Permissions ({filteredProfiles.length})
              </h2>

              <button
                type="button"
                onClick={handleOpenAddEmployeeModal}
                className="h-7 px-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs"
              >
                <UserPlus className="w-3.5 h-3.5" /> Add Employee
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Filter employees..."
                  className="h-8 pl-7 pr-2.5 text-xs bg-[var(--card-bg)] border border-[var(--border)] rounded-xl outline-none focus:border-teal-500"
                />
                <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2 top-2.5" />
              </div>

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                className="h-8 px-2 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl text-xs font-semibold outline-none focus:border-teal-500"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending Only</option>
                <option value="approved">Approved Only</option>
                <option value="revoked">Revoked</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--badge-bg)] border-b border-[var(--border)] text-[var(--text-secondary)] font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Assigned Team / Level</th>
                  <th className="px-4 py-3">Access Tier</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredProfiles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-[var(--text-muted)] italic">
                      No employees added yet under this company. Click "Create Employee Account" above to provision staff credentials!
                    </td>
                  </tr>
                ) : (
                  filteredProfiles.map(prof => {
                    return (
                      <tr key={prof.id} className="hover:bg-[var(--badge-bg)] transition-colors">
                        {/* Employee Name & Email */}
                        <td className="px-4 py-3.5">
                          <div className="font-bold text-[var(--text-primary)]">{prof.full_name || 'Staff Member'}</div>
                          <div className="text-[11px] text-[var(--text-muted)] font-mono">{prof.email}</div>
                        </td>

                        {/* Team Selector */}
                        <td className="px-4 py-3.5">
                          <select
                            value={prof.team_id || ''}
                            onChange={e => handleUpdateStatus(prof.id, prof.status, prof.role, e.target.value || undefined)}
                            className="h-8 px-2.5 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl text-xs font-semibold shadow-2xs outline-none focus:border-teal-500 max-w-[170px]"
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
                            className="h-8 px-2.5 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl text-xs font-semibold shadow-2xs outline-none focus:border-teal-500"
                          >
                            <option value="org_admin">Org Admin</option>
                            <option value="level_1">Level 1 (Full Access)</option>
                            <option value="level_2">Level 2 (Limited Access)</option>
                            <option value="level_3">Level 3 (View Only)</option>
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

                        {/* UNIFORM SYMBOL-ONLY ACTIONS (h-8 w-8) */}
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            
                            {/* Manage Feature Flags Modal */}
                            <button
                              type="button"
                              onClick={() => setManagingUser(prof)}
                              title="Manage Feature Flags & Permissions"
                              className="h-8 w-8 flex items-center justify-center bg-[var(--badge-bg)] hover:bg-[var(--border)] text-[var(--text-primary)] rounded-xl transition-all border border-[var(--border)] shadow-2xs"
                            >
                              <Sliders className="w-4 h-4 text-[var(--text-secondary)]" />
                            </button>

                            {/* Approve */}
                            {prof.status !== 'approved' && (
                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(prof.id, 'approved', prof.role, prof.team_id || undefined)}
                                title="Approve Employee Access"
                                className="h-8 w-8 flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all shadow-2xs"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}

                            {/* Revoke */}
                            {prof.status !== 'revoked' && (
                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(prof.id, 'revoked', prof.role, prof.team_id || undefined)}
                                title="Revoke Employee Access"
                                className="h-8 w-8 flex items-center justify-center text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl transition-all border border-rose-200 shadow-2xs"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}

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
      )}

      {/* COMPANY DATA BACKUP PANEL */}
      {currentSection === 'backup' && (
        <div className="bg-[var(--card-bg)] p-6 rounded-3xl border border-[var(--border)] shadow-2xs space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/10 text-teal-600 flex items-center justify-center border border-teal-500/20">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">Company Data Backup & Export Center</h2>
              <p className="text-xs text-[var(--text-muted)]">
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

      {/* CREATE EMPLOYEE ACCOUNT MODAL (DIRECT ADMIN PROVISIONING) */}
      {showAddEmployeeModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-[var(--card-bg)] rounded-3xl p-6 max-w-md w-full shadow-2xl border border-[var(--border)] space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-teal-500/10 text-teal-600 flex items-center justify-center border border-teal-500/20">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)]">Create Employee Account</h2>
                <p className="text-xs text-[var(--text-muted)]">Provision a login ID and password for your staff member.</p>
              </div>
            </div>

            <form onSubmit={handleCreateEmployee} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-[var(--text-secondary)] mb-1">Employee Full Name</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={newEmpName}
                    onChange={e => setNewEmpName(e.target.value)}
                    placeholder="e.g. Alex Merchandiser"
                    className="w-full h-9 pl-9 pr-3 bg-[var(--badge-bg)] border border-[var(--border)] rounded-xl outline-none focus:border-teal-500 font-semibold"
                  />
                  <User className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-2.5" />
                </div>
              </div>

              <div>
                <label className="block font-bold text-[var(--text-secondary)] mb-1">Employee Email Address (Login ID)</label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    value={newEmpEmail}
                    onChange={e => setNewEmpEmail(e.target.value)}
                    placeholder="e.g. alex@company.com"
                    className="w-full h-9 pl-9 pr-3 bg-[var(--badge-bg)] border border-[var(--border)] rounded-xl outline-none focus:border-teal-500 font-mono"
                  />
                  <Mail className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-2.5" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-[var(--text-secondary)]">Initial Login Password</label>
                  <button
                    type="button"
                    onClick={() => setNewEmpPassword(generateDefaultPassword())}
                    className="text-[10px] text-teal-600 hover:underline font-bold flex items-center gap-0.5"
                  >
                    <Sparkles className="w-3 h-3" /> Auto-Generate
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={newEmpPassword}
                    onChange={e => setNewEmpPassword(e.target.value)}
                    placeholder="Enter password..."
                    className="w-full h-9 pl-9 pr-3 bg-[var(--badge-bg)] border border-[var(--border)] rounded-xl outline-none focus:border-teal-500 font-mono font-bold text-[var(--text-primary)]"
                  />
                  <Lock className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-2.5" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[var(--text-secondary)] mb-1">Department / Team</label>
                  <select
                    value={newEmpTeamId}
                    onChange={e => setNewEmpTeamId(e.target.value)}
                    className="w-full h-9 px-2 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl outline-none focus:border-teal-500 font-semibold"
                  >
                    <option value="">No Team Assigned</option>
                    {teams.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} (L{t.level_depth})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-[var(--text-secondary)] mb-1">Access Level</label>
                  <select
                    value={newEmpRole}
                    onChange={e => setNewEmpRole(e.target.value as UserRole)}
                    className="w-full h-9 px-2 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl outline-none focus:border-teal-500 font-semibold"
                  >
                    <option value="level_1">Level 1 (Full)</option>
                    <option value="level_2">Level 2 (Limited)</option>
                    <option value="level_3">Level 3 (View Only)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setShowAddEmployeeModal(false)}
                  className="h-9 px-4 text-[var(--text-secondary)] font-semibold rounded-xl hover:bg-[var(--badge-bg)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingEmployee}
                  className="h-9 px-4 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-2xs flex items-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{creatingEmployee ? 'Creating Account...' : 'Create & Approve'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATED EMPLOYEE CREDENTIALS MODAL */}
      {createdEmployee && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-[var(--card-bg)] rounded-3xl p-6 max-w-md w-full shadow-2xl border border-[var(--border)] space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center border border-emerald-500/20">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)]">Employee Account Created!</h2>
                <p className="text-xs text-[var(--text-muted)]">Account is active. Send these login details to your employee.</p>
              </div>
            </div>

            <div className="bg-[var(--badge-bg)] p-4 rounded-2xl border border-[var(--border)] space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Employee Name:</span>
                <span className="font-bold text-[var(--text-primary)]">{createdEmployee.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Login Email:</span>
                <span className="font-mono font-bold text-[var(--text-primary)]">{createdEmployee.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Password:</span>
                <span className="font-mono font-bold bg-[var(--sidebar-bg)] text-teal-300 px-2 py-0.5 rounded">
                  {createdEmployee.password}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Workspace Code:</span>
                <span className="font-mono font-bold text-[var(--text-primary)]">{organization?.org_code || 'APACHE'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Team & Access:</span>
                <span className="font-semibold text-[var(--text-primary)]">{createdEmployee.teamName} ({createdEmployee.role.replace('_', ' ').toUpperCase()})</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCreatedEmployee(null)}
                className="h-9 px-4 text-[var(--text-secondary)] font-semibold rounded-xl hover:bg-[var(--badge-bg)] text-xs"
              >
                Done
              </button>

              <button
                type="button"
                onClick={copyEmployeeCredentials}
                className="h-9 px-4 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-xs text-xs flex items-center gap-1.5"
              >
                {copiedCreds ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedCreds ? 'Copied Credentials!' : 'Copy Employee Login Card'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT TEAM MODAL */}
      {showAddTeamModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--card-bg)] rounded-3xl p-6 max-w-md w-full shadow-2xl border border-[var(--border)] space-y-4">
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              {editingTeam ? 'Edit Department / Team' : 'Add Department or Team Level'}
            </h2>
            
            <form onSubmit={handleSaveTeam} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-[var(--text-secondary)] mb-1">Department / Team Name</label>
                <input
                  type="text"
                  required
                  value={newTeamName}
                  onChange={e => setNewTeamName(e.target.value)}
                  placeholder="e.g. Production Department or Stitching Line A"
                  className="w-full h-9 px-3 bg-[var(--badge-bg)] border border-[var(--border)] rounded-xl outline-none focus:border-teal-500 font-semibold"
                />
              </div>

              <div>
                <label className="block font-semibold text-[var(--text-secondary)] mb-1">Parent Level (Leave empty for Division Level 1)</label>
                <select
                  value={newParentTeamId}
                  onChange={e => setNewParentTeamId(e.target.value)}
                  className="w-full h-9 px-3 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl outline-none focus:border-teal-500 font-semibold"
                >
                  <option value="">Top-Level Division (Level 1)</option>
                  {teams.filter(t => editingTeam ? t.id !== editingTeam.id : true).map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} (Level {t.level_depth})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[var(--text-secondary)] mb-1">Default Access Level for Members</label>
                <select
                  value={newTeamDefaultRole}
                  onChange={e => setNewTeamDefaultRole(e.target.value as UserRole)}
                  className="w-full h-9 px-3 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl outline-none focus:border-teal-500 font-semibold"
                >
                  <option value="level_1">Level 1 (Full Access)</option>
                  <option value="level_2">Level 2 (Limited Access)</option>
                  <option value="level_3">Level 3 (View Only)</option>
                </select>
                <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
                  Employees assigned to this team will inherit this access level.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddTeamModal(false);
                    setEditingTeam(null);
                  }}
                  className="h-9 px-4 text-[var(--text-secondary)] font-semibold rounded-xl hover:bg-[var(--badge-bg)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-9 px-4 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-2xs"
                >
                  {editingTeam ? 'Save Changes' : 'Create Team Level'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MANAGE EMPLOYEE ENTITLEMENTS & ACCESS MODAL */}
      {managingUser && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--card-bg)] rounded-3xl p-6 max-w-md w-full shadow-2xl border border-[var(--border)] space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)]">Manage Employee Access & Features</h2>
                <p className="text-xs text-[var(--text-muted)] font-mono mt-0.5">{managingUser.email}</p>
              </div>
              <button onClick={() => setManagingUser(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
            </div>

            <div className="space-y-3">
              <div className="text-xs font-bold text-[var(--text-primary)]">Feature Entitlements:</div>
              {FEATURE_LIST.map(f => {
                const userFeats = userFeatures[managingUser.id] || { base_tier: true, node_mutation: true, google_calendar_sync: false, advanced_reports: false, admin_management: false };
                const isEnabled = Boolean(userFeats[f.key]);

                return (
                  <div key={f.key} className="p-3 bg-[var(--badge-bg)] rounded-2xl border border-[var(--border)] flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-[var(--text-primary)]">{f.name}</div>
                      <div className="text-[10px] text-[var(--text-muted)]">{f.description}</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleFeature(managingUser.id, f.key)}
                      className={`h-7 px-3 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                        isEnabled
                          ? 'bg-teal-600 text-white shadow-xs'
                          : 'bg-gray-200 text-[var(--text-secondary)] hover:bg-gray-300'
                      }`}
                    >
                      {isEnabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                      <span>{isEnabled ? 'Enabled' : 'Disabled'}</span>
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setManagingUser(null)}
                className="h-9 px-5 bg-[var(--sidebar-bg)] text-white font-bold text-xs rounded-xl shadow-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT COMPANY SETTINGS MODAL */}
      {showEditSettingsModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--card-bg)] rounded-3xl p-6 max-w-md w-full shadow-2xl border border-[var(--border)] space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-teal-600" />
                <span>Edit Company Information & Logo</span>
              </h2>
              <button onClick={() => setShowEditSettingsModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
            </div>

            <form onSubmit={handleSaveCompanySettings} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-[var(--text-primary)] mb-1">Company Display Title</label>
                <input
                  type="text"
                  required
                  value={editBrandTitle}
                  onChange={e => setEditBrandTitle(e.target.value)}
                  placeholder="e.g. Cadence - Apache Footwear"
                  className="w-full h-9 px-3 bg-[var(--badge-bg)] border border-[var(--border)] rounded-xl outline-none focus:border-teal-500 font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-[var(--text-primary)] mb-1">Company Tagline</label>
                <input
                  type="text"
                  value={editBrandTagline}
                  onChange={e => setEditBrandTagline(e.target.value)}
                  placeholder="e.g. adidas Ex-Factory Production Critical Path Tracker"
                  className="w-full h-9 px-3 bg-[var(--badge-bg)] border border-[var(--border)] rounded-xl outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block font-bold text-[var(--text-primary)] mb-1">Company Logo URL</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={editLogoUrl}
                    onChange={e => setEditLogoUrl(e.target.value)}
                    placeholder="https://example.com/logo.png"
                    className="flex-1 h-9 px-3 bg-[var(--badge-bg)] border border-[var(--border)] rounded-xl font-mono outline-none focus:border-teal-500"
                  />
                  {editLogoUrl && (
                    <div className="w-9 h-9 border border-[var(--border)] rounded-xl flex items-center justify-center p-1 bg-[var(--card-bg)] shrink-0">
                      <img src={editLogoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditSettingsModal(false)}
                  className="h-9 px-4 text-[var(--text-secondary)] font-semibold rounded-xl hover:bg-[var(--badge-bg)]"
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
    </div>
  );
};
