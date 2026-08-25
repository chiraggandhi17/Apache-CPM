import React, { useState, useEffect } from 'react';
import { useNodes } from '../../context/NodeContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { TodayView } from '../today/TodayView';
import { NodeTree } from '../nodes/NodeTree';
import { CalendarView } from '../calendar/CalendarView';
import { NodeInspectorModal } from '../nodes/NodeInspectorModal';
import { ManageAlertsModal } from '../reminders/ManageAlertsModal';
import { AdminDashboard } from '../admin/AdminDashboard';
import { SuperAdminDashboard } from '../admin/SuperAdminDashboard';
import { OrgAdminDashboard } from '../admin/OrgAdminDashboard';
import { GoogleCalendarSyncModal } from '../calendar/GoogleCalendarSyncModal';
import { ProtectedAppGuard } from '../auth/Guards';
import { LoginPage } from '../auth/LoginPage';
import { Bell, Calendar, Home, Layers, LogOut, Footprints, ChevronRight, ShieldCheck, Sparkles, User, Building2, FolderTree } from 'lucide-react';

type NavTab = 'today' | 'browse' | 'calendar' | 'admin' | 'super_admin' | 'org_admin';

export const AppShellContent: React.FC = () => {
  const { selectedNode, setSelectedNode, totalScheduledAlertsCount, triggeredAlertsCount } = useNodes();
  const { user, profile, organization, team, isSuperAdmin, isOrgAdmin, signOut } = useAuth();
  
  const [activeTab, setActiveTab] = useState<NavTab>('today');
  const [showManageAlerts, setShowManageAlerts] = useState(false);
  const [showGoogleCalSync, setShowGoogleCalSync] = useState(false);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number>(0);

  // Determine Dynamic Branding
  const brandTitle = isSuperAdmin 
    ? 'Cadence' 
    : (organization?.brand_title || (organization ? `Cadence - ${organization.name}` : 'Cadence - Apache Footwear'));

  const brandTagline = isSuperAdmin
    ? 'SaaS Platform Owner Console'
    : (organization?.brand_tagline || 'adidas Ex-Factory Production Critical Path Tracker');

  const brandColor = organization?.brand_color || '#0d9488';
  const logoUrl = organization?.logo_url;

  // Update Browser Document Tab Title Dynamically
  useEffect(() => {
    const tabNames: Record<NavTab, string> = {
      today: 'Action Feed',
      browse: 'Hierarchy Tree',
      calendar: 'Master Calendar',
      admin: 'Security Center',
      super_admin: 'Super Admin Console',
      org_admin: 'Org Admin Center',
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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row text-gray-900 antialiased">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-slate-900 text-slate-100 flex md:flex-col justify-between shrink-0 p-4 border-r border-slate-800">
        <div>
          {/* Logo Brand Header (Co-Branded) */}
          <div className="flex items-center gap-3 px-2 py-3 mb-6 border-b border-slate-800 pb-4">
            {logoUrl ? (
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

          {/* Navigation Links */}
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

            {/* Super Admin Platform Console */}
            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab('super_admin')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                  activeTab === 'super_admin'
                    ? 'bg-purple-600 text-white shadow-sm font-bold'
                    : 'text-purple-300 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Building2 className="w-4 h-4" />
                  <span>SaaS Super Admin</span>
                </div>
                <span className="text-[9px] bg-purple-400/20 text-purple-200 px-1.5 py-0.5 rounded-full font-mono font-bold">
                  Platform
                </span>
              </button>
            )}

            {/* Organization Admin Console */}
            {isOrgAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab('org_admin')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                  activeTab === 'org_admin'
                    ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                    : 'text-amber-400 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Company Org Admin</span>
                </div>

                {pendingApprovalsCount > 0 ? (
                  <span className="text-[9px] bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full font-mono font-extrabold animate-bounce">
                    {pendingApprovalsCount} New
                  </span>
                ) : (
                  <span className="text-[9px] bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded-full font-mono font-bold">
                    Org
                  </span>
                )}
              </button>
            )}
          </nav>
        </div>

        {/* Global Controls & Sidebar Profile Footer */}
        <div className="pt-4 border-t border-slate-800/80 space-y-2">
          
          {/* Google Cal Sync Launcher */}
          <button
            type="button"
            onClick={() => setShowGoogleCalSync(true)}
            className="w-full bg-slate-850 hover:bg-slate-800 border border-slate-750 p-2.5 rounded-xl flex items-center justify-between text-xs text-slate-200 transition-colors group shadow-2xs"
          >
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" style={{ color: brandColor }} />
              <span className="font-semibold text-[11px]">Google Cal Sync</span>
            </div>
            <Sparkles className="w-3.5 h-3.5" style={{ color: brandColor }} />
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
                  {displayRole} {team ? `• ${team.name}` : ''}
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
      <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full overflow-y-auto">
        {activeTab === 'today' && <TodayView onSelectNode={setSelectedNode} />}
        {activeTab === 'browse' && <NodeTree onSelectNode={setSelectedNode} />}
        {activeTab === 'calendar' && <CalendarView onSelectNode={setSelectedNode} />}
        {activeTab === 'admin' && <AdminDashboard />}
        {activeTab === 'super_admin' && <SuperAdminDashboard />}
        {activeTab === 'org_admin' && <OrgAdminDashboard />}
      </main>

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
