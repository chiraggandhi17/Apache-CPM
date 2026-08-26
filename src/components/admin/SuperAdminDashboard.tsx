import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Organization, UserProfile } from '../../context/AuthContext';
import { 
  Building2, Plus, ShieldCheck, ToggleLeft, ToggleRight, Sparkles, 
  Layers, Palette, Download, Trash2, Activity, Server, Database, 
  HardDrive, AlertTriangle, CheckCircle2, RefreshCw, Clock, Globe, 
  ShieldAlert, Cpu, Terminal, Copy, Check, ExternalLink, Edit3, Settings,
  User, Send, ArrowUpCircle, XCircle, Search, Filter
} from 'lucide-react';

const BRAND_PALETTES = [
  { name: 'Teal (Default)', hex: '#0d9488' },
  { name: 'Royal Blue', hex: '#2563eb' },
  { name: 'Midnight Indigo', hex: '#4f46e5' },
  { name: 'Crimson Red', hex: '#e11d48' },
  { name: 'Amber Gold', hex: '#d97706' },
  { name: 'Emerald Green', hex: '#059669' },
  { name: 'Deep Purple', hex: '#7c3aed' },
  { name: 'Dark Slate', hex: '#334155' },
];

interface SystemLogEntry {
  id: string;
  timestamp: string;
  type: 'error' | 'warning' | 'info';
  service: 'PostgreSQL' | 'Auth' | 'Realtime' | 'Cascade RPC' | 'Storage';
  message: string;
  org_name?: string;
}

interface TableStats {
  organizations: number;
  profiles: number;
  individualUsers: number;
  teams: number;
  nodes: number;
  reminders: number;
  estimatedStorageKb: number;
}

interface TierUpgradeRequest {
  id: string;
  user_id: string | null;
  user_email: string;
  user_name: string | null;
  org_id: string | null;
  org_name: string | null;
  requested_tier: string;
  current_tier: string;
  status: 'pending' | 'approved' | 'rejected';
  notes: string | null;
  created_at: string;
}

interface SuperAdminDashboardProps {
  currentSection?: 'organizations' | 'individuals' | 'requests' | 'observability' | 'errors' | 'backups';
}

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({ currentSection = 'organizations' }) => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [upgradeRequests, setUpgradeRequests] = useState<TierUpgradeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);

  // Search & Filters for All Users Directory
  const [userSearch, setUserSearch] = useState('');
  const [userTypeFilter, setUserTypeFilter] = useState<'all' | 'individual' | 'organization'>('all');
  
  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [createdOrgPackage, setCreatedOrgPackage] = useState<Organization | null>(null);
  const [copiedOrgId, setCopiedOrgId] = useState<string | null>(null);

  // Table Statistics & Quota Telemetry
  const [stats, setStats] = useState<TableStats>({
    organizations: 0,
    profiles: 0,
    individualUsers: 0,
    teams: 0,
    nodes: 0,
    reminders: 0,
    estimatedStorageKb: 140,
  });

  const [dbLatencyMs, setDbLatencyMs] = useState<number>(4);

  // Provision New Client Organization Form State
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgCode, setNewOrgCode] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newOrgTier, setNewOrgTier] = useState<'starter' | 'pro' | 'enterprise'>('enterprise');

  // Edit Organization Form State
  const [editName, setEditName] = useState('');
  const [editOrgCode, setEditOrgCode] = useState('');
  const [editAdminEmail, setEditAdminEmail] = useState('');
  const [editTier, setEditTier] = useState<'starter' | 'pro' | 'enterprise'>('enterprise');
  const [editBrandTitle, setEditBrandTitle] = useState('');
  const [editBrandTagline, setEditBrandTagline] = useState('');
  const [editBrandColor, setEditBrandColor] = useState('#0d9488');
  const [editBrandLogoUrl, setEditBrandLogoUrl] = useState('');

  const loadData = async () => {
    setLoading(true);
    const startPing = performance.now();
    try {
      // 1. Fetch Organizations directly from Supabase (Single Source of Truth)
      const { data: orgs, error: orgErr } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });

      if (orgErr) {
        console.error('Organizations fetch error:', orgErr);
        if (orgErr.message?.includes('organizations') || orgErr.code === '42P01' || orgErr.message?.includes('schema cache')) {
          setSchemaMissing(true);
        }
        setOrganizations([]);
      } else {
        setSchemaMissing(false);
        setOrganizations(orgs || []);
      }

      // 2. Fetch ALL Profiles (both individual and organization members)
      const { data: profs, error: profErr } = await supabase
        .from('profiles')
        .select('*')
        .not('role', 'eq', 'super_admin')
        .order('created_at', { ascending: false });

      if (profErr) {
        console.error('Profiles fetch error:', profErr);
        setAllUsers([]);
      } else {
        setAllUsers((profs as UserProfile[]) || []);
      }

      // 3. Fetch Tier Upgrade Requests
      try {
        const { data: reqs } = await supabase
          .from('tier_upgrade_requests')
          .select('*')
          .order('created_at', { ascending: false });
        setUpgradeRequests((reqs as TierUpgradeRequest[]) || []);
      } catch {
        setUpgradeRequests([]);
      }

      // 4. Counts
      const [profilesRes, teamsRes, nodesRes, remindersRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('teams').select('id', { count: 'exact', head: true }),
        supabase.from('nodes').select('id', { count: 'exact', head: true }),
        supabase.from('reminders').select('id', { count: 'exact', head: true }),
      ]);

      const orgCount = orgs?.length || 0;
      const profCount = profilesRes.count || 0;
      const teamCount = teamsRes.count || 0;
      const nodeCount = nodesRes.count || 0;
      const remCount = remindersRes.count || 0;
      const indivCount = profs ? profs.filter(p => !p.org_id || p.account_type === 'individual').length : 0;

      const estimatedKb = Math.round((orgCount * 3) + (profCount * 2) + (teamCount * 1) + (nodeCount * 3.5) + (remCount * 1.5));

      setStats({
        organizations: orgCount,
        profiles: profCount,
        individualUsers: indivCount,
        teams: teamCount,
        nodes: nodeCount,
        reminders: remCount,
        estimatedStorageKb: Math.max(estimatedKb, 140),
      });

      const endPing = performance.now();
      setDbLatencyMs(Math.round(endPing - startPing));
    } catch (err: any) {
      console.error('Error fetching telemetry:', err);
      setOrganizations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim() || !newOrgCode.trim() || !newAdminEmail.trim()) return;

    try {
      const codeUpper = newOrgCode.trim().toUpperCase();
      const slug = newOrgName.trim().toLowerCase().replace(/\s+/g, '-');
      
      const newOrg: Partial<Organization> = {
        name: newOrgName.trim(),
        slug,
        org_code: codeUpper,
        primary_admin_email: newAdminEmail.trim().toLowerCase(),
        subscription_tier: newOrgTier,
        status: 'active',
        brand_color: '#0d9488',
        brand_title: `Cadence - ${newOrgName.trim()}`,
        brand_tagline: 'Enterprise Ex-Factory CPM Tracker',
        features: {
          google_calendar_sync: true,
          advanced_reports: true,
          node_mutation: true,
        },
      };

      const { data, error } = await supabase
        .from('organizations')
        .insert(newOrg)
        .select()
        .single();

      if (error) throw error;

      const created = data as Organization;
      setCreatedOrgPackage(created);

      setNewOrgName('');
      setNewOrgCode('');
      setNewAdminEmail('');
      setShowCreateModal(false);

      await loadData();
    } catch (err: any) {
      alert('Failed to provision client organization: ' + err.message);
    }
  };

  const handleOpenEditOrg = (org: Organization) => {
    setEditingOrg(org);
    setEditName(org.name);
    setEditOrgCode(org.org_code || '');
    setEditAdminEmail(org.primary_admin_email || '');
    setEditTier(org.subscription_tier || 'enterprise');
    setEditBrandTitle(org.brand_title || `Cadence - ${org.name}`);
    setEditBrandTagline(org.brand_tagline || 'Enterprise Ex-Factory CPM Tracker');
    setEditBrandColor(org.brand_color || '#0d9488');
    setEditBrandLogoUrl(org.logo_url || '');
  };

  const handleSaveEditOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrg) return;

    try {
      const { error } = await supabase
        .from('organizations')
        .update({
          name: editName.trim(),
          org_code: editOrgCode.trim().toUpperCase(),
          primary_admin_email: editAdminEmail.trim().toLowerCase(),
          subscription_tier: editTier,
          brand_title: editBrandTitle.trim() || `Cadence - ${editName.trim()}`,
          brand_tagline: editBrandTagline.trim() || 'Enterprise Ex-Factory CPM Tracker',
          logo_url: editBrandLogoUrl.trim() || null,
          brand_color: editBrandColor,
        })
        .eq('id', editingOrg.id);

      if (error) throw error;

      setEditingOrg(null);
      await loadData();
    } catch (err: any) {
      alert('Error saving organization changes: ' + err.message);
    }
  };

  const handleUpdateIndividualTier = async (userId: string, newTier: 'tier_1' | 'tier_2' | 'tier_3') => {
    try {
      await supabase.from('profiles').update({ tier: newTier, updated_at: new Date().toISOString() }).eq('id', userId);
      await loadData();
    } catch (err: any) {
      alert('Error updating user tier: ' + err.message);
    }
  };

  const handleDeleteUser = async (userId: string, userEmail: string) => {
    if (!confirm(`Are you sure you want to permanently delete user account "${userEmail}"?\n\nThis will remove their profile and workspace access.`)) {
      return;
    }

    try {
      const { error } = await supabase.from('profiles').delete().eq('id', userId);
      if (error) throw error;
      alert(`User account "${userEmail}" deleted successfully.`);
      await loadData();
    } catch (err: any) {
      console.error('Delete user error:', err);
      alert(`Failed to delete user: ${err.message}`);
    }
  };

  // Complete Cascade Deletion of Organization & All Associated Member Accounts
  const handleDeleteOrganization = async (orgId: string, orgName: string) => {
    const confirmName = prompt(`⚠️ CAUTION: Deleting "${orgName}" will permanently purge the organization, all member user accounts, teams, and critical path nodes.\n\nType "${orgName}" to confirm deletion:`);
    if (confirmName !== orgName) {
      if (confirmName !== null) alert('Deletion cancelled: Name did not match.');
      return;
    }

    try {
      const targetOrg = organizations.find(o => o.id === orgId);

      // 1. Delete all node audit logs
      await supabase.from('node_audit_logs').delete().eq('org_id', orgId);
      
      // 2. Delete all nodes in org
      await supabase.from('nodes').delete().eq('org_id', orgId);

      // 3. Delete all teams in org
      await supabase.from('teams').delete().eq('org_id', orgId);

      // 4. Delete all upgrade requests for org
      await supabase.from('tier_upgrade_requests').delete().eq('org_id', orgId);

      // 5. Delete ALL user profiles associated with this org
      await supabase.from('profiles').delete().eq('org_id', orgId);
      if (targetOrg?.primary_admin_email) {
        await supabase.from('profiles').delete().eq('email', targetOrg.primary_admin_email.toLowerCase());
      }

      // 6. Delete the organization record
      const { error: orgDelErr } = await supabase.from('organizations').delete().eq('id', orgId);
      if (orgDelErr) throw orgDelErr;

      alert(`Organization "${orgName}" and all associated member accounts have been permanently purged from Supabase.`);
      await loadData();
    } catch (err: any) {
      console.error('Error deleting organization:', err);
      alert('Error deleting organization: ' + err.message);
    }
  };

  const getBasePortalUrl = (): string => {
    return window.location.origin;
  };

  const copyOrgWorkspaceDetails = async (org: Organization) => {
    const portalUrl = getBasePortalUrl();
    const cleanInvite = `Welcome to ${org.name} on Cadence CPM!\n\nYour Workspace Login Code: ${org.org_code || 'APACHE'}\nPortal URL: ${portalUrl}\nPrimary Admin: ${org.primary_admin_email || 'admin@apache.com'}\n\nPlease visit ${portalUrl}, click "Register Account" -> "Company / Org", and enter Workspace Code: ${org.org_code || 'APACHE'} to access your department timeline.`;

    const success = await copyTextToClipboard(cleanInvite);
    if (success) {
      setCopiedOrgId(org.id);
      setTimeout(() => setCopiedOrgId(null), 3000);
    } else {
      prompt('Copy organization workspace info below:', cleanInvite);
    }
  };

  const pendingRequestsCount = upgradeRequests.filter(r => r.status === 'pending').length;

  // Filtered Users List
  const filteredUsers = allUsers.filter(u => {
    if (userTypeFilter === 'individual' && (u.org_id || u.account_type === 'organization')) return false;
    if (userTypeFilter === 'organization' && (!u.org_id && u.account_type === 'individual')) return false;

    if (userSearch.trim()) {
      const q = userSearch.toLowerCase();
      return u.email.toLowerCase().includes(q) || (u.full_name && u.full_name.toLowerCase().includes(q));
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Super Admin Control Banner */}
      <div className="bg-slate-900 text-white p-6 rounded-3xl border border-slate-800 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30 mb-2">
            <ShieldCheck className="w-3.5 h-3.5" /> Platform Super Administrator
          </div>
          <h1 className="text-xl md:text-2xl font-black tracking-tight">Platform SaaS Control & Telemetry Console</h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Manage multi-tenant organizations, review tier upgrades, oversee all registered users, and purge client accounts.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row md:flex-col gap-2.5 w-full md:w-56 shrink-0">
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="w-full h-10 px-4 bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-xl font-bold text-xs shadow-lg shadow-teal-500/20 transition-all flex items-center justify-center gap-2 shrink-0"
          >
            <Plus className="w-4 h-4" /> Provision Client Org
          </button>

          <button
            type="button"
            onClick={loadData}
            className="w-full h-9 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh Telemetry
          </button>
        </div>
      </div>

      {/* Telemetry Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">Organizations</span>
          <span className="text-lg font-black text-gray-900 font-mono mt-0.5 block">{stats.organizations}</span>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">Registered Users</span>
          <span className="text-lg font-black text-gray-900 font-mono mt-0.5 block">{allUsers.length}</span>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-teal-600 block">Personal Free Users</span>
          <span className="text-lg font-black text-teal-700 font-mono mt-0.5 block">{stats.individualUsers}</span>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">Active Milestones</span>
          <span className="text-lg font-black text-gray-900 font-mono mt-0.5 block">{stats.nodes}</span>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 block">Active Alerts</span>
          <span className="text-lg font-black text-amber-700 font-mono mt-0.5 block">{stats.reminders}</span>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">DB Latency</span>
          <span className="text-lg font-black text-emerald-600 font-mono mt-0.5 block">{dbLatencyMs} ms</span>
        </div>
      </div>

      {/* SECTION: CLIENT ORGANIZATIONS DIRECTORY */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-2xs overflow-hidden">
        <div className="p-4 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-teal-600" /> Provisioned Client Organizations ({organizations.length})
          </h2>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Provision Client Org
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3">Organization Name</th>
                <th className="px-4 py-3">Workspace Code</th>
                <th className="px-4 py-3">Primary Admin Email</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {organizations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-400 italic">
                    No client organizations provisioned in database yet. Click "Provision Client Org" above to add your first tenant.
                  </td>
                </tr>
              ) : (
                organizations.map(org => {
                  const isCopied = copiedOrgId === org.id;

                  return (
                    <tr key={org.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div 
                            className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-white shadow-2xs shrink-0"
                            style={{ backgroundColor: org.brand_color || '#0d9488' }}
                          >
                            {org.name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-bold text-gray-900">{org.name}</div>
                            <div className="text-[11px] text-gray-500 truncate max-w-xs">{org.brand_tagline || 'Ex-Factory CPM'}</div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="font-mono bg-slate-900 text-teal-300 font-bold px-2 py-1 rounded-md text-[11px]">
                          {org.org_code}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 font-mono text-gray-700">
                        {org.primary_admin_email}
                      </td>

                      <td className="px-4 py-3.5">
                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase font-mono ${
                          org.subscription_tier === 'enterprise' 
                            ? 'bg-amber-50 text-amber-800 border border-amber-200' 
                            : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                        }`}>
                          {org.subscription_tier || 'enterprise'}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-bold border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" /> Active
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => copyOrgWorkspaceDetails(org)}
                            title={isCopied ? 'Copied Workspace Details!' : 'Copy Workspace Credentials'}
                            className="h-8 w-8 flex items-center justify-center rounded-xl border border-teal-200 text-teal-700 bg-teal-50 hover:bg-teal-100 transition-colors shadow-2xs"
                          >
                            {isCopied ? <Check className="w-4 h-4 text-emerald-600 stroke-[3]" /> : <Copy className="w-4 h-4" />}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenEditOrg(org)}
                            title="Edit Organization & Tier"
                            className="h-8 w-8 flex items-center justify-center rounded-xl border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors shadow-2xs"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteOrganization(org.id, org.name)}
                            title="Delete Organization & Purge All Member Accounts"
                            className="h-8 w-8 flex items-center justify-center rounded-xl border border-rose-200 text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors shadow-2xs"
                          >
                            <Trash2 className="w-4 h-4" />
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

      {/* SECTION: ALL REGISTERED PLATFORM USERS DIRECTORY */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-2xs overflow-hidden space-y-3 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-teal-600" />
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-900">All Registered User Accounts ({filteredUsers.length})</h2>
              <p className="text-[11px] text-gray-500">Overview of all individual personal accounts and organization members</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <input
                type="text"
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                placeholder="Search email or name..."
                className="text-xs pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:border-teal-500 font-medium"
              />
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2" />
            </div>

            {/* Filter */}
            <select
              value={userTypeFilter}
              onChange={e => setUserTypeFilter(e.target.value as any)}
              className="text-xs px-3 py-1.5 bg-gray-50 border border-gray-300 rounded-xl font-semibold outline-none focus:border-teal-500"
            >
              <option value="all">All User Types</option>
              <option value="individual">Personal (Individual)</option>
              <option value="organization">Company Members</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3">User Profile</th>
                <th className="px-4 py-3">Workspace Type</th>
                <th className="px-4 py-3">Role & Access</th>
                <th className="px-4 py-3">Assigned Tier</th>
                <th className="px-4 py-3 text-right">Admin Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400 italic">
                    No registered user accounts matching search filter.
                  </td>
                </tr>
              ) : (
                filteredUsers.map(u => {
                  const isPersonal = !u.org_id || u.account_type === 'individual';
                  const orgName = u.org_id ? organizations.find(o => o.id === u.org_id)?.name || 'Company Workspace' : 'Personal Workspace';

                  return (
                    <tr key={u.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-gray-900">{u.full_name || 'Registered User'}</div>
                        <div className="text-[11px] text-gray-500 font-mono">{u.email}</div>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold ${
                          isPersonal 
                            ? 'bg-slate-100 text-slate-700 border border-slate-200' 
                            : 'bg-teal-50 text-teal-800 border border-teal-200'
                        }`}>
                          {isPersonal ? '👤 Personal Free' : `🏢 ${orgName}`}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="text-[11px] font-bold text-gray-800 capitalize font-mono">
                          {u.role.replace(/_/g, ' ')}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase font-mono ${
                          (u as any).tier === 'tier_3'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : (u as any).tier === 'tier_2' 
                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' 
                            : 'bg-teal-50 text-teal-700 border border-teal-200'
                        }`}>
                          {(u as any).tier || 'tier_1'}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isPersonal && (
                            <select
                              value={(u as any).tier || 'tier_1'}
                              onChange={e => handleUpdateIndividualTier(u.id, e.target.value as any)}
                              className="h-8 px-2 bg-white border border-gray-300 rounded-xl text-xs font-semibold outline-none focus:border-teal-500"
                            >
                              <option value="tier_1">Tier 1: Personal</option>
                              <option value="tier_2">Tier 2: Pro</option>
                              <option value="tier_3">Tier 3: Enterprise</option>
                            </select>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDeleteUser(u.id, u.email)}
                            title="Delete User Account"
                            className="h-8 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl font-bold text-xs transition-colors border border-rose-200 flex items-center justify-center gap-1 shadow-2xs"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete Account</span>
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

      {/* CREATE NEW CLIENT ORG MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-gray-200 space-y-4">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Plus className="w-5 h-5 text-teal-600" />
              <span>Provision Client Organization</span>
            </h2>

            <form onSubmit={handleCreateOrganization} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Company / Organization Name</label>
                <input
                  type="text"
                  required
                  value={newOrgName}
                  onChange={e => setNewOrgName(e.target.value)}
                  placeholder="e.g. Apache Footwear Tier 1"
                  className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:border-teal-500 font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Workspace Code (Unique ID)</label>
                <input
                  type="text"
                  required
                  value={newOrgCode}
                  onChange={e => setNewOrgCode(e.target.value.toUpperCase())}
                  placeholder="e.g. APACHE"
                  className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:border-teal-500 font-mono uppercase font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Primary Org Admin Email</label>
                <input
                  type="email"
                  required
                  value={newAdminEmail}
                  onChange={e => setNewAdminEmail(e.target.value)}
                  placeholder="admin@apache.com"
                  className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:border-teal-500 font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Subscription Tier</label>
                <select
                  value={newOrgTier}
                  onChange={e => setNewOrgTier(e.target.value as any)}
                  className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-xl font-bold outline-none focus:border-teal-500"
                >
                  <option value="enterprise">Tier 3: Enterprise Ex-Factory</option>
                  <option value="pro">Tier 2: Pro Power User</option>
                  <option value="starter">Tier 1: Starter</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-gray-600 font-semibold rounded-xl hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-2xs"
                >
                  Provision Client Org
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT ORGANIZATION MODAL */}
      {editingOrg && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-gray-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-teal-600" />
              <span>Edit Organization: {editingOrg.name}</span>
            </h2>

            <form onSubmit={handleSaveEditOrganization} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Organization Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:border-teal-500 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Workspace Code</label>
                  <input
                    type="text"
                    required
                    value={editOrgCode}
                    onChange={e => setEditOrgCode(e.target.value.toUpperCase())}
                    className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:border-teal-500 font-mono font-bold uppercase"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Primary Admin Email</label>
                  <input
                    type="email"
                    required
                    value={editAdminEmail}
                    onChange={e => setEditAdminEmail(e.target.value)}
                    className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:border-teal-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Brand Title Header</label>
                <input
                  type="text"
                  value={editBrandTitle}
                  onChange={e => setEditBrandTitle(e.target.value)}
                  placeholder="e.g. Cadence - Apache Footwear"
                  className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:border-teal-500 font-semibold"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEditingOrg(null)}
                  className="px-4 py-2 text-gray-600 font-semibold rounded-xl hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-2xs"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
