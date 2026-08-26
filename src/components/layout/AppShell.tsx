import React, { useState, useEffect } from 'react';
import { useNodes } from '../../context/NodeContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { TodayView } from '../today/TodayView';
import { NodeTree } from '../nodes/NodeTree';
import { CalendarView } from '../calendar/CalendarView';
import { NodeInspectorModal } from '../nodes/NodeInspectorModal';
import { ManageAlertsModal } from '../reminders/ManageAlertsModal';
import { SuperAdminDashboard } from '../admin/SuperAdminDashboard';
import { OrgAdminDashboard } from '../admin/OrgAdminDashboard';
import { GoogleCalendarSyncModal } from '../calendar/GoogleCalendarSyncModal';
import { TierPricingModal } from '../shared/TierPricingModal';
import { PersonalUserSettingsModal } from '../settings/PersonalUserSettingsModal';
import { ProtectedAppGuard } from '../auth/Guards';
import { LoginPage } from '../auth/LoginPage';
import { 
  Bell, Calendar, Home, Layers, LogOut, Footprints, ChevronRight, 
  ShieldCheck, Sparkles, User, Building2, FolderTree, Activity, 
  AlertTriangle, Download, HardDrive, Users, CheckCircle2, Zap, Settings, KeyRound, Menu, X
} from 'lucide-react';

type NavTab = 'today' | 'browse' | 'calendar' | 'super_admin' | 'super_observability' | 'super_errors' | 'super_backups' | 'org_admin' | 'org_teams' | 'org_backup';

export const AppShellContent: React.FC = () => {
  const { selectedNode, setSelectedNode, totalScheduledAlertsCount, triggeredAlertsCount } = useNodes();
  const { user, profile, organization, team, isSuperAdmin, isOrgAdmin, isIndividual, tier, signOut } = useAuth();
  
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Set default landing tab based on role
  const isCompanyOrgAdmin = Boolean(profile && profile.role === 'org_admin');
  
  const [activeTab, setActiveTab] = useState<NavTab>(() => {
    if (profile?.role === 'super_admin') return 'super_admin';
    if (profile?.role === 'org_admin') return 'org_admin';
    return 'today';
  });

  useEffect(() => {
    if (isSuperAdmin) {
      setActiveTab('super_admin');
    } else if (isCompanyOrgAdmin) {
      setActiveTab('org_admin');
    } else {
      setActiveTab('today');
    }
  }, [profile?.role, isSuperAdmin, isCompanyOrgAdmin]);

  const [showManageAlerts, setShowManageAlerts] = useState(false);
  const [showGoogleCalSync, setShowGoogleCalSync] = useState(false);
  const [showTierPricingModal, setShowTierPricingModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number>(0);

  // Determine Dynamic Branding
  const brandTitle = isSuperAdmin 
    ? 'Cadence' 
    : isIndividual 
    ? 'Cadence Personal'
    : (organization?.brand_title || (organization ? `Cadence - ${organization.name}` : 'Cadence CPM'));

  const brandTagline = isSuperAdmin
    ? 'SaaS Platform Super Admin'
    : isIndividual
    ? 'Personal Critical Path & Task Workspace'
    : (organization?.brand_tagline || 'Enterprise Production Critical Path Tracker');

  const brandColor = isIndividual 
    ? (tier === 1 ? '#0d9488' : '#6366f1') 
    : (organization?.brand_color || '#0d9488');
    
  const logoUrl = !isIndividual ? organization?.logo_url : null;

  // Update Browser Document Tab Title Dynamically
  useEffect(() => {
    const tabNames: Record<NavTab, string> = {
      today: 'Action Feed',
      browse: 'Hierarchy Tree',
      calendar: 'Master Calendar',
      super_admin: 'Client Organizations',
      super_observability: 'Cloud Infrastructure & Telemetry',
      super_errors: 'System Error Logs',
      super_backups: 'Platform Database Backups',
      org_admin: 'Employee Directory & Approvals',
      org_teams: 'Company Org Structure',
      org_backup: 'Company Data Export',
    };
    document.title = `${brandTitle} | ${tabNames[activeTab] || 'Dashboard'}`;
  }, [brandTitle, activeTab]);

  // Poll for pending user approvals to notify Org Admin
  useEffect(() => {
    if (!isOrgAdmin) return;

    const checkPendingApprovals = async () => {
      try {
        const { count } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending');
        setPendingApprovalsCount(count || 0);
      } catch {
        setPendingApprovalsCount(0);
      }
    };

    checkPendingApprovals();
    const interval = setInterval(checkPendingApprovals, 30000);
    return () => clearInterval(interval);
  }, [isOrgAdmin]);

  const handleSignOut = async () => {
    await signOut();
  };

  const displayEmail = profile?.email || user?.email || 'Logged In User';
  const displayRole = profile?.role ? profile.role.replace(/_/g, ' ') : 'user';

  const tierLabels = {
    1: { name: 'Tier 1: Personal', color: 'bg-teal-500/20 text-teal-300 border-teal-500/30' },
    2: { name: 'Tier 2: Pro', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
    3: { name: 'Tier 3: Enterprise', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row text-gray-900 antialiased relative">
      {/* STICKY TOP MOBILE BAR (Only shown on small screens md:hidden) */}
      <header className="md:hidden sticky top-0 z-40 bg-slate-900 text-white border-b border-slate-800 px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2.5 min-w-0">
          {logoUrl && !isSuperAdmin ? (
            <img src={logoUrl} alt="Logo" className="w-7 h-7 object-contain rounded-lg bg-white p-0.5 shrink-0" />
          ) : (
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-950 font-black text-sm shrink-0"
              style={{ backgroundColor: brandColor }}
            >
              <Footprints className="w-4 h-4 text-slate-950" />
            </div>
          )}
          <span className="font-extrabold text-sm tracking-tight truncate" title={brandTitle}>
            {brandTitle}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {triggeredAlertsCount > 0 && (
            <button
              type="button"
              onClick={() => setShowManageAlerts(true)}
              className="px-2 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-[10px] font-bold flex items-center gap-1 animate-pulse"
            >
              <Bell className="w-3 h-3 text-amber-400" />
              <span>{triggeredAlertsCount}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-slate-300 hover:text-white bg-slate-800 rounded-xl transition-colors"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* MOBILE DRAWER OVERLAY (Shown when mobileMenuOpen is true on mobile) */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex flex-col justify-between p-4 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-2">
            <div className="flex items-center gap-2">
              <Footprints className="w-5 h-5 text-teal-400" />
              <span className="font-bold text-white text-sm">{brandTitle} Navigation</span>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-xl"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="overflow-y-auto space-y-3 flex-1 pr-1">
            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => { setActiveTab('super_admin'); setMobileMenuOpen(false); }}
                className="w-full p-3 bg-teal-500 text-slate-950 rounded-xl font-extrabold text-xs flex items-center justify-between shadow-md"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Platform Admin Console</span>
                </div>
                <span className="text-[10px] bg-slate-950 text-teal-300 px-2 py-0.5 rounded font-mono font-bold">Admin</span>
              </button>
            )}

            <div className="space-y-1">
              <div className="text-[10px] uppercase font-bold text-slate-500 px-2">Main Navigation</div>
              <button
                type="button"
                onClick={() => { setActiveTab('today'); setMobileMenuOpen(false); }}
                className={`w-full p-3 rounded-xl text-xs font-bold flex items-center justify-between ${
                  activeTab === 'today' ? 'bg-slate-800 text-white' : 'text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Home className="w-4 h-4 text-teal-400" />
                  <span>Today / Action Feed</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => { setActiveTab('browse'); setMobileMenuOpen(false); }}
                className={`w-full p-3 rounded-xl text-xs font-bold flex items-center justify-between ${
                  activeTab === 'browse' ? 'bg-slate-800 text-white' : 'text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  <span>Browse Hierarchy Tree</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => { setActiveTab('calendar'); setMobileMenuOpen(false); }}
                className={`w-full p-3 rounded-xl text-xs font-bold flex items-center justify-between ${
                  activeTab === 'calendar' ? 'bg-slate-800 text-white' : 'text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-amber-400" />
                  <span>Master Calendar</span>
                </div>
              </button>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
            <div className="truncate">
              <span className="text-white block font-bold text-xs truncate">{displayEmail}</span>
              <span className="text-slate-400 text-[10px] block truncate">{displayRole}</span>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="px-3 py-2 bg-rose-500/20 text-rose-300 rounded-xl text-xs font-bold flex items-center gap-1"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Sidebar Navigation (Hidden on small mobile screens md:flex) */}
      <aside className="hidden md:flex w-64 bg-slate-900 text-slate-100 flex-col justify-between shrink-0 p-4 border-r border-slate-800">
        <div>
          {/* Logo Brand Header (Co-Branded) */}
          <div className="flex items-center gap-3 px-2 py-3 mb-4 border-b border-slate-800 pb-4">
            {logoUrl && !isSuperAdmin ? (
              <img src={logoUrl} alt="Company Logo" className="w-9 h-9 object-contain rounded-xl bg-white p-1 shrink-0" />
            ) : (
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-950 font-extrabold text-xl shadow-lg shrink-0"
                style={{ backgroundColor: brandColor }}
              >
                <Footprints className="w-5 h-5 text-slate-950" />
              </div>
            )}
            <div className="min-w-0">
              <span className="font-extrabold text-sm tracking-tight block text-white truncate" title={brandTitle}>
                {brandTitle}
              </span>
              <span className="text-[9px] text-slate-400 font-medium block truncate max-w-[150px]" title={brandTagline}>
                {brandTagline}
              </span>
            </div>
          </div>

          {/* Persistent Platform Admin Console Switcher for Super Admins Only */}
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab('super_admin')}
              className={`w-full mb-3 px-3 py-2.5 rounded-xl border text-xs font-extrabold flex items-center justify-between transition-all shadow-sm ${
                activeTab.startsWith('super')
                  ? 'bg-teal-500 text-slate-950 border-teal-400'
                  : 'bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border-teal-500/40'
              }`}
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-teal-300" />
                <span>Platform Admin Console</span>
              </div>
              <span className="text-[10px] bg-slate-950 text-teal-300 px-1.5 py-0.5 rounded font-mono font-black border border-teal-500/30">
                SaaS Admin
              </span>
            </button>
          )}

          {/* Active Workspace Tier Selector Button */}
          {!isSuperAdmin && (
            <button
              type="button"
              onClick={() => setShowTierPricingModal(true)}
              className={`w-full mb-4 px-3 py-2 rounded-xl border text-[11px] font-bold flex items-center justify-between transition-all hover:brightness-110 shadow-2xs ${tierLabels[tier].color}`}
            >
              <div className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" />
                <span>{tierLabels[tier].name}</span>
              </div>
              <span className="text-[10px] underline text-slate-400">Plans</span>
            </button>
          )}

          {/* DEDICATED SUPER ADMIN NAVIGATION */}
          {isSuperAdmin ? (
            <nav className="space-y-1">
              <div className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500 px-3 py-1 mb-1">
                Platform Console
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('super_admin')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                  activeTab === 'super_admin'
                    ? 'bg-teal-500 text-slate-950 shadow-sm font-bold'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Building2 className="w-4 h-4" />
                  <span>SaaS Organizations</span>
                </div>
                <span className="text-[10px] bg-slate-800 text-teal-300 px-1.5 py-0.5 rounded font-mono font-bold">
                  Clients
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('super_observability')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                  activeTab === 'super_observability'
                    ? 'bg-teal-500 text-slate-950 shadow-sm font-bold'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Activity className="w-4 h-4" />
                  <span>Cloud & Quotas</span>
                </div>
                <span className="text-[10px] bg-slate-800 text-slate-400 font-mono">
                  Metrics
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('super_errors')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                  activeTab === 'super_errors'
                    ? 'bg-teal-500 text-slate-950 shadow-sm font-bold'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="w-4 h-4" />
                  <span>System Error Logs</span>
                </div>
                <span className="text-[10px] bg-slate-800 text-slate-400 font-mono">
                  Audit
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('super_backups')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                  activeTab === 'super_backups'
                    ? 'bg-teal-500 text-slate-950 shadow-sm font-bold'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Download className="w-4 h-4" />
                  <span>Global DB Backups</span>
                </div>
                <span className="text-[10px] bg-slate-800 text-slate-400 font-mono">
                  JSON
                </span>
              </button>
            </nav>
          ) : isCompanyOrgAdmin ? (
            /* DEDICATED COMPANY ORG ADMIN NAVIGATION */
            <nav className="space-y-1">
              <div className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500 px-3 py-1 mb-1">
                Company Admin Center
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('org_admin')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                  activeTab === 'org_admin'
                    ? 'text-slate-950 shadow-sm font-bold'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
                style={activeTab === 'org_admin' ? { backgroundColor: brandColor } : {}}
              >
                <div className="flex items-center gap-2.5">
                  <Users className="w-4 h-4" />
                  <span>Employee Directory</span>
                </div>
                {pendingApprovalsCount > 0 ? (
                  <span className="text-[9px] bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full font-mono font-extrabold animate-bounce">
                    {pendingApprovalsCount} New
                  </span>
                ) : (
                  <span className="text-[10px] bg-slate-800 text-slate-400 font-mono">
                    Staff
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('org_teams')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                  activeTab === 'org_teams'
                    ? 'text-slate-950 shadow-sm font-bold'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
                style={activeTab === 'org_teams' ? { backgroundColor: brandColor } : {}}
              >
                <div className="flex items-center gap-2.5">
                  <FolderTree className="w-4 h-4" />
                  <span>Company Org Structure</span>
                </div>
                <span className="text-[10px] bg-slate-800 text-slate-400 font-mono">
                  Teams
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('org_backup')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                  activeTab === 'org_backup'
                    ? 'text-slate-950 shadow-sm font-bold'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
                style={activeTab === 'org_backup' ? { backgroundColor: brandColor } : {}}
              >
                <div className="flex items-center gap-2.5">
                  <HardDrive className="w-4 h-4" />
                  <span>Company Data Export</span>
                </div>
                <span className="text-[10px] bg-slate-800 text-slate-400 font-mono">
                  Backup
                </span>
              </button>
            </nav>
          ) : (
            /* OPERATIONAL CPM USER NAVIGATION (Managers & Personal Users) */
            <nav className="space-y-1">
              <button
                type="button"
                onClick={() => setActiveTab('today')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                  activeTab === 'today'
                    ? 'text-slate-950 shadow-sm font-bold'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
                style={activeTab === 'today' ? { backgroundColor: brandColor } : {}}
              >
                <div className="flex items-center gap-2.5">
                  <Home className="w-4 h-4" />
                  <span>Today / Action Feed</span>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                  activeTab === 'today' ? 'bg-slate-950 text-white' : 'bg-slate-800 text-slate-400'
                }`}>
                  Home
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('browse')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                  activeTab === 'browse'
                    ? 'text-slate-950 shadow-sm font-bold'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
                style={activeTab === 'browse' ? { backgroundColor: brandColor } : {}}
              >
                <div className="flex items-center gap-2.5">
                  <Layers className="w-4 h-4" />
                  <span>Browse Hierarchy</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">Tree</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('calendar')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                  activeTab === 'calendar'
                    ? 'text-slate-950 shadow-sm font-bold'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
                style={activeTab === 'calendar' ? { backgroundColor: brandColor } : {}}
              >
                <div className="flex items-center gap-2.5">
                  <Calendar className="w-4 h-4" />
                  <span>Master Calendar</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">Grid</span>
              </button>
            </nav>
          )}
        </div>

        {/* Global Controls & Sidebar Profile Footer */}
        <div className="pt-4 border-t border-slate-800/80 space-y-2">
          
          {/* Operational Tools (Only shown for non-Super Admin operational users) */}
          {!isSuperAdmin && !isCompanyOrgAdmin && (
            <>
              {/* Google Cal Sync Launcher (Tier 2 & 3 Feature) */}
              <button
                type="button"
                onClick={() => {
                  if (tier < 2) {
                    setShowTierPricingModal(true);
                  } else {
                    setShowGoogleCalSync(true);
                  }
                }}
                className="w-full bg-slate-850 hover:bg-slate-800 border border-slate-750 p-2.5 rounded-xl flex items-center justify-between text-xs text-slate-200 transition-colors group shadow-2xs"
              >
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" style={{ color: brandColor }} />
                  <span className="font-semibold text-[11px]">Google Cal Sync</span>
                </div>
                {tier < 2 ? (
                  <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded font-mono font-bold">PRO</span>
                ) : (
                  <Sparkles className="w-3.5 h-3.5" style={{ color: brandColor }} />
                )}
              </button>

              {/* Manage Alerts Pill */}
              <button
                type="button"
                onClick={() => setShowManageAlerts(true)}
                className="w-full bg-slate-800/90 hover:bg-slate-800 border border-slate-700/80 p-2.5 rounded-xl flex items-center justify-between text-xs text-slate-200 transition-colors group shadow-2xs"
              >
                <div className="flex items-center gap-2.5">
                  <div className="relative">
                    <Bell className={`w-4 h-4 ${triggeredAlertsCount > 0 ? 'text-amber-400 animate-bounce' : 'text-slate-400'}`} />
                    {triggeredAlertsCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full" />
                    )}
                  </div>
                  <div className="text-left">
                    <span className="font-semibold block text-[11px] leading-tight">Manage Alerts</span>
                    <span className="text-[9px] text-slate-400 block font-mono">
                      {totalScheduledAlertsCount} scheduled
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
              </button>

              {/* Personal Workspace Settings Button */}
              <button
                type="button"
                onClick={() => setShowSettingsModal(true)}
                className="w-full bg-slate-850 hover:bg-slate-800 border border-slate-750 p-2.5 rounded-xl flex items-center justify-between text-xs text-slate-200 transition-colors group shadow-2xs"
              >
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-teal-400" />
                  <span className="font-semibold text-[11px]">Workspace Settings</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
              </button>
            </>
          )}

          {/* Bottom-left Sidebar User Footer */}
          <div className="bg-slate-850 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between gap-2 text-xs">
            <div className="min-w-0 flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 border border-white/20 text-slate-950"
                style={{ backgroundColor: brandColor }}
              >
                <User className="w-3.5 h-3.5" />
              </div>
              <div className="truncate">
                <span className="text-slate-200 font-semibold block truncate text-[11px]">
                  {displayEmail}
                </span>
                <span className="text-[9px] font-mono uppercase tracking-wider block truncate" style={{ color: brandColor }}>
                  {isSuperAdmin ? '👑 Super Admin' : isIndividual ? 'Personal User' : `${displayRole} ${team ? `• ${team.name}` : ''}`}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              title="Sign Out of Cadence"
              className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 rounded-lg transition-colors shrink-0 flex items-center gap-1 text-[11px] font-bold"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-3 sm:p-6 md:p-8 pb-24 md:pb-8 max-w-7xl mx-auto w-full overflow-y-auto">
        {/* Super Admin Sections */}
        {activeTab === 'super_admin' && <SuperAdminDashboard currentSection="organizations" />}
        {activeTab === 'super_observability' && <SuperAdminDashboard currentSection="observability" />}
        {activeTab === 'super_errors' && <SuperAdminDashboard currentSection="errors" />}
        {activeTab === 'super_backups' && <SuperAdminDashboard currentSection="backups" />}

        {/* Org Admin Sections */}
        {activeTab === 'org_admin' && <OrgAdminDashboard currentSection="users" />}
        {activeTab === 'org_teams' && <OrgAdminDashboard currentSection="teams" />}
        {activeTab === 'org_backup' && <OrgAdminDashboard currentSection="backup" />}

        {/* Operational CPM Views */}
        {activeTab === 'today' && <TodayView onSelectNode={setSelectedNode} />}
        {activeTab === 'browse' && <NodeTree onSelectNode={setSelectedNode} />}
        {activeTab === 'calendar' && <CalendarView onSelectNode={setSelectedNode} />}
      </main>

      {/* FIXED MOBILE BOTTOM QUICK TAB BAR (Only shown on small screens md:hidden) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 flex items-center justify-around z-40 px-2 shadow-xl">
        <button
          type="button"
          onClick={() => setActiveTab('today')}
          className={`flex flex-col items-center justify-center w-16 py-1 rounded-xl transition-colors ${
            activeTab === 'today' ? 'text-teal-400 font-bold' : 'text-slate-400'
          }`}
        >
          <Home className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Today</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('browse')}
          className={`flex flex-col items-center justify-center w-16 py-1 rounded-xl transition-colors ${
            activeTab === 'browse' ? 'text-teal-400 font-bold' : 'text-slate-400'
          }`}
        >
          <Layers className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Tree</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('calendar')}
          className={`flex flex-col items-center justify-center w-16 py-1 rounded-xl transition-colors ${
            activeTab === 'calendar' ? 'text-teal-400 font-bold' : 'text-slate-400'
          }`}
        >
          <Calendar className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Grid</span>
        </button>

        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab('super_admin')}
            className={`flex flex-col items-center justify-center w-16 py-1 rounded-xl transition-colors ${
              activeTab.startsWith('super') ? 'text-teal-400 font-bold' : 'text-slate-400'
            }`}
          >
            <ShieldCheck className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">Admin</span>
          </button>
        )}
      </nav>

      {/* Center Focus Inspector Modal */}
      {selectedNode && (
        <NodeInspectorModal
          initialNode={selectedNode}
          onClose={() => setSelectedNode(null)}
        />
      )}

      {/* Manage Alerts Modal */}
      {showManageAlerts && (
        <ManageAlertsModal
          onClose={() => setShowManageAlerts(false)}
        />
      )}

      {/* Google Calendar Sync Modal */}
      {showGoogleCalSync && (
        <GoogleCalendarSyncModal
          onClose={() => setShowGoogleCalSync(false)}
        />
      )}

      {/* Tier Pricing & Upgrade Modal */}
      {showTierPricingModal && (
        <TierPricingModal
          onClose={() => setShowTierPricingModal(false)}
        />
      )}

      {/* Personal User Settings Modal */}
      {showSettingsModal && (
        <PersonalUserSettingsModal
          onClose={() => setShowSettingsModal(false)}
        />
      )}

    </div>
  );
};

export const AppShell: React.FC = () => {
  return (
    <ProtectedAppGuard fallbackLogin={<LoginPage />}>
      <AppShellContent />
    </ProtectedAppGuard>
  );
};
