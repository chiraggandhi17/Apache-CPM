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
import { ExportModal } from '../shared/ExportModal';
import { ProtectedAppGuard } from '../auth/Guards';
import { LoginPage } from '../auth/LoginPage';
import { 
  Bell, Calendar, Home, Layers, LogOut, Footprints, ChevronRight, 
  ShieldCheck, Sparkles, User, Building2, FolderTree, Activity, 
  AlertTriangle, Download, HardDrive, Users, CheckCircle2, Zap, Settings, KeyRound, Menu, X, FileSpreadsheet
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
  const [showExportModal, setShowExportModal] = useState(false);
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
    <div className="min-h-screen flex flex-col md:flex-row antialiased relative" style={{ backgroundColor: 'var(--canvas-bg)', color: 'var(--text-primary)' }}>
      {/* STICKY TOP MOBILE BAR (Only shown on small screens md:hidden) */}
      <header className="md:hidden sticky top-0 z-40 px-4 py-3 flex items-center justify-between shadow-md" style={{ backgroundColor: 'var(--sidebar-bg)', color: 'var(--sidebar-text)', borderBottom: '1px solid var(--sidebar-border)' }}>
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
      <aside className="hidden md:flex w-64 flex-col justify-between shrink-0 p-3 border-r transition-colors" style={{ backgroundColor: 'var(--sidebar-bg)', borderColor: 'var(--sidebar-border)', color: 'var(--sidebar-text)' }}>
        <div className="space-y-1">
          {/* Logo Brand Header */}
          <div className="flex items-center gap-3 px-2 py-3 mb-3 border-b pb-3" style={{ borderColor: 'var(--sidebar-border)' }}>
            {logoUrl && !isSuperAdmin ? (
              <img src={logoUrl} alt="Company Logo" className="w-8 h-8 object-contain rounded-lg bg-white/10 p-0.5 shrink-0" />
            ) : (
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center font-extrabold text-lg shrink-0"
                style={{ backgroundColor: 'var(--sidebar-active)', color: 'var(--sidebar-active-text)' }}
              >
                <Footprints className="w-4 h-4" />
              </div>
            )}
            <div className="min-w-0">
              <span className="font-bold text-sm tracking-tight block truncate" style={{ color: 'var(--sidebar-text)' }} title={brandTitle}>
                {brandTitle}
              </span>
              <span className="text-[9px] font-medium block truncate max-w-[150px]" style={{ color: 'var(--sidebar-text-muted)' }} title={brandTagline}>
                {brandTagline}
              </span>
            </div>
          </div>

          {/* Super Admin Console Switcher */}
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab('super_admin')}
              className={`w-full mb-2 px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                activeTab.startsWith('super') ? 'shadow-sm' : 'opacity-80 hover:opacity-100'
              }`}
              style={activeTab.startsWith('super')
                ? { backgroundColor: 'var(--sidebar-active)', color: 'var(--sidebar-active-text)' }
                : { backgroundColor: 'var(--sidebar-hover)', color: 'var(--sidebar-text)' }
              }
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Platform Admin</span>
            </button>
          )}

          {/* â”€â”€â”€â”€ NAVIGATION SECTION â”€â”€â”€â”€ */}
          {isSuperAdmin ? (
            <nav className="space-y-0.5">
              <div className="text-[10px] uppercase tracking-widest font-bold px-3 pt-3 pb-1.5" style={{ color: 'var(--sidebar-section-label)' }}>
                Platform Console
              </div>

              {[
                { tab: 'super_admin', icon: Building2, label: 'Organizations' },
                { tab: 'super_observability', icon: Activity, label: 'Cloud & Quotas' },
                { tab: 'super_errors', icon: AlertTriangle, label: 'Error Logs' },
                { tab: 'super_backups', icon: Download, label: 'DB Backups' },
              ].map(item => (
                <button
                  key={item.tab}
                  type="button"
                  onClick={() => setActiveTab(item.tab as typeof activeTab)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
                  style={activeTab === item.tab
                    ? { backgroundColor: 'var(--sidebar-active)', color: 'var(--sidebar-active-text)' }
                    : { color: 'var(--sidebar-text)' }
                  }
                  onMouseEnter={e => { if (activeTab !== item.tab) (e.currentTarget.style.backgroundColor = 'var(--sidebar-hover)'); }}
                  onMouseLeave={e => { if (activeTab !== item.tab) (e.currentTarget.style.backgroundColor = 'transparent'); }}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          ) : isCompanyOrgAdmin ? (
            <nav className="space-y-0.5">
              <div className="text-[10px] uppercase tracking-widest font-bold px-3 pt-3 pb-1.5" style={{ color: 'var(--sidebar-section-label)' }}>
                Company Admin
              </div>

              {[
                { tab: 'org_admin', icon: Users, label: 'Employee Directory', badge: pendingApprovalsCount > 0 ? `${pendingApprovalsCount} New` : null },
                { tab: 'org_teams', icon: FolderTree, label: 'Org Structure' },
                { tab: 'org_backup', icon: HardDrive, label: 'Data Export' },
              ].map(item => (
                <button
                  key={item.tab}
                  type="button"
                  onClick={() => setActiveTab(item.tab as typeof activeTab)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all"
                  style={activeTab === item.tab
                    ? { backgroundColor: 'var(--sidebar-active)', color: 'var(--sidebar-active-text)' }
                    : { color: 'var(--sidebar-text)' }
                  }
                  onMouseEnter={e => { if (activeTab !== item.tab) (e.currentTarget.style.backgroundColor = 'var(--sidebar-hover)'); }}
                  onMouseLeave={e => { if (activeTab !== item.tab) (e.currentTarget.style.backgroundColor = 'transparent'); }}
                >
                  <div className="flex items-center gap-2.5">
                    <item.icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </div>
                  {'badge' in item && item.badge && (
                    <span className="text-[9px] bg-amber-400 text-amber-950 px-1.5 py-0.5 rounded-md font-mono font-bold animate-pulse">
                      {item.badge}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          ) : (
            /* â”€â”€â”€â”€ OPERATIONAL CPM USER NAVIGATION â”€â”€â”€â”€ */
            <nav className="space-y-0.5">
              <div className="text-[10px] uppercase tracking-widest font-bold px-3 pt-2 pb-1.5" style={{ color: 'var(--sidebar-section-label)' }}>
                Navigation
              </div>

              {[
                { tab: 'today', icon: Home, label: 'Today' },
                { tab: 'browse', icon: Layers, label: 'Hierarchy' },
                { tab: 'calendar', icon: Calendar, label: 'Calendar' },
              ].map(item => (
                <button
                  key={item.tab}
                  type="button"
                  onClick={() => setActiveTab(item.tab as typeof activeTab)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
                  style={activeTab === item.tab
                    ? { backgroundColor: 'var(--sidebar-active)', color: 'var(--sidebar-active-text)' }
                    : { color: 'var(--sidebar-text)' }
                  }
                  onMouseEnter={e => { if (activeTab !== item.tab) (e.currentTarget.style.backgroundColor = 'var(--sidebar-hover)'); }}
                  onMouseLeave={e => { if (activeTab !== item.tab) (e.currentTarget.style.backgroundColor = 'transparent'); }}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              ))}

              {/* â”€â”€â”€â”€ TOOLS SECTION â”€â”€â”€â”€ */}
              <div className="text-[10px] uppercase tracking-widest font-bold px-3 pt-4 pb-1.5" style={{ color: 'var(--sidebar-section-label)' }}>
                Tools
              </div>

              {/* Manage Alerts */}
              <button
                type="button"
                onClick={() => setShowManageAlerts(true)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all"
                style={{ color: 'var(--sidebar-text)' }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--sidebar-hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <div className="flex items-center gap-2.5">
                  <div className="relative">
                    <Bell className={`w-4 h-4 shrink-0 ${triggeredAlertsCount > 0 ? 'text-amber-400' : ''}`} style={triggeredAlertsCount === 0 ? { color: 'var(--sidebar-text-muted)' } : {}} />
                    {triggeredAlertsCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full" />
                    )}
                  </div>
                  <span>Alerts</span>
                </div>
                {totalScheduledAlertsCount > 0 && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-md" style={{ backgroundColor: 'var(--sidebar-hover)', color: 'var(--sidebar-text-muted)' }}>
                    {totalScheduledAlertsCount}
                  </span>
                )}
              </button>

              {/* Export Schedule */}
              <button
                type="button"
                onClick={() => setShowExportModal(true)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
                style={{ color: 'var(--sidebar-text)' }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--sidebar-hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <FileSpreadsheet className="w-4 h-4 shrink-0" style={{ color: 'var(--sidebar-text-muted)' }} />
                <span>Export Excel</span>
              </button>

              {/* Google Cal Sync */}
              <button
                type="button"
                onClick={() => {
                  if (tier < 2) {
                    setShowTierPricingModal(true);
                  } else {
                    setShowGoogleCalSync(true);
                  }
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all"
                style={{ color: 'var(--sidebar-text)' }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--sidebar-hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <div className="flex items-center gap-2.5">
                  <Calendar className="w-4 h-4 shrink-0" style={{ color: 'var(--sidebar-text-muted)' }} />
                  <span>Google Cal</span>
                </div>
                {tier < 2 && (
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md" style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent)' }}>
                    PRO
                  </span>
                )}
              </button>
            </nav>
          )}
        </div>

        {/* â”€â”€â”€â”€ BOTTOM PINNED: Settings + Profile â”€â”€â”€â”€ */}
        <div className="space-y-2 pt-3 border-t" style={{ borderColor: 'var(--sidebar-border)' }}>
          
          {/* Settings Button (operational users) */}
          {!isSuperAdmin && !isCompanyOrgAdmin && (
            <button
              type="button"
              onClick={() => setShowSettingsModal(true)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all"
              style={{ color: 'var(--sidebar-text)' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--sidebar-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <div className="flex items-center gap-2.5">
                <Settings className="w-4 h-4 shrink-0" style={{ color: 'var(--sidebar-text-muted)' }} />
                <span>Settings</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--sidebar-text-muted)' }} />
            </button>
          )}

          {/* Subtle Tier Indicator (tucked at bottom â€” not prominent) */}
          {!isSuperAdmin && (
            <button
              type="button"
              onClick={() => setShowTierPricingModal(true)}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all"
              style={{ color: 'var(--sidebar-text-muted)' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--sidebar-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <Zap className="w-3 h-3 shrink-0" style={{ color: 'var(--accent)' }} />
              <span>{tierLabels[tier].name}</span>
              <span className="ml-auto text-[9px] underline" style={{ color: 'var(--sidebar-text-muted)' }}>Plans</span>
            </button>
          )}

          {/* User Profile Footer */}
          <div className="p-2.5 rounded-lg flex items-center justify-between gap-2 text-xs" style={{ backgroundColor: 'var(--sidebar-hover)', borderColor: 'var(--sidebar-border)' }}>
            <div className="min-w-0 flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-md flex items-center justify-center font-bold text-xs shrink-0"
                style={{ backgroundColor: 'var(--sidebar-active)', color: 'var(--sidebar-active-text)' }}
              >
                <User className="w-3.5 h-3.5" />
              </div>
              <div className="truncate">
                <span className="font-semibold block truncate text-[11px]" style={{ color: 'var(--sidebar-text)' }}>
                  {displayEmail}
                </span>
                <span className="text-[9px] font-mono uppercase tracking-wider block truncate" style={{ color: 'var(--sidebar-text-muted)' }}>
                  {isSuperAdmin ? 'ðŸ‘‘ Super Admin' : isIndividual ? 'Personal User' : `${displayRole} ${team ? `â€¢ ${team.name}` : ''}`}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              title="Sign Out"
              className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 rounded-md transition-colors shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
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
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 backdrop-blur-md flex items-center justify-around z-40 px-2 shadow-xl" style={{ backgroundColor: 'var(--sidebar-bg)', borderTop: '1px solid var(--sidebar-border)' }}>
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

      {/* Export Excel / CSV Modal */}
      {showExportModal && (
        <ExportModal
          onClose={() => setShowExportModal(false)}
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
