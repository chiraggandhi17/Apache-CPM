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
import { GoogleCalendarSyncModal } from '../calendar/GoogleCalendarSyncModal';
import { ProtectedAppGuard } from '../auth/Guards';
import { LoginPage } from '../auth/LoginPage';
import { Bell, Calendar, Home, Layers, LogOut, Footprints, ChevronRight, ShieldCheck, Sparkles } from 'lucide-react';

type NavTab = 'today' | 'browse' | 'calendar' | 'admin';

export const AppShellContent: React.FC = () => {
  const { selectedNode, setSelectedNode, totalScheduledAlertsCount, triggeredAlertsCount } = useNodes();
  const { profile, hasRole, signOut } = useAuth();
  
  const [activeTab, setActiveTab] = useState<NavTab>('today');
  const [showManageAlerts, setShowManageAlerts] = useState(false);
  const [showGoogleCalSync, setShowGoogleCalSync] = useState(false);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number>(0);

  // Poll for pending user approvals to notify Admin
  useEffect(() => {
    if (!hasRole(['admin'])) return;

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
  }, [hasRole]);

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row text-gray-900 antialiased">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-slate-900 text-slate-100 flex md:flex-col justify-between shrink-0 p-4 border-r border-slate-800">
        <div>
          {/* Logo Brand */}
          <div className="flex items-center gap-3 px-2 py-3 mb-6">
            <div className="w-9 h-9 rounded-xl bg-teal-500 flex items-center justify-center text-slate-900 font-extrabold text-xl shadow-lg shadow-teal-500/20">
              <Footprints className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight block text-white">Cadence</span>
              <span className="text-[10px] text-slate-400 font-medium block">Apache Footwear (adidas)</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            <button
              type="button"
              onClick={() => setActiveTab('today')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'today'
                  ? 'bg-teal-500 text-slate-950 shadow-sm font-bold'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Home className="w-4 h-4" />
                <span>Today / Action Feed</span>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                activeTab === 'today' ? 'bg-slate-950 text-teal-300' : 'bg-slate-800 text-slate-400'
              }`}>
                Home
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('browse')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'browse'
                  ? 'bg-teal-500 text-slate-950 shadow-sm font-bold'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
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
                  ? 'bg-teal-500 text-slate-950 shadow-sm font-bold'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Calendar className="w-4 h-4" />
                <span>Master Calendar</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">Grid</span>
            </button>

            {/* Admin Security Center (With Pending Notifications Badge) */}
            {hasRole(['admin']) && (
              <button
                type="button"
                onClick={() => setActiveTab('admin')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                  activeTab === 'admin'
                    ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                    : 'text-amber-400 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Admin Security Center</span>
                </div>

                {pendingApprovalsCount > 0 ? (
                  <span className="text-[9px] bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full font-mono font-extrabold animate-bounce">
                    {pendingApprovalsCount} New
                  </span>
                ) : (
                  <span className="text-[9px] bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded-full font-mono font-bold">
                    Admin
                  </span>
                )}
              </button>
            )}
          </nav>
        </div>

        {/* Global Manage Alerts & Google Cal Buttons */}
        <div className="pt-4 border-t border-slate-800/80 space-y-2">
          
          {/* Google Cal Sync Launcher */}
          <button
            type="button"
            onClick={() => setShowGoogleCalSync(true)}
            className="w-full bg-teal-950/60 hover:bg-teal-900/80 border border-teal-700/60 p-2.5 rounded-xl flex items-center justify-between text-xs text-teal-200 transition-colors group shadow-2xs"
          >
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-teal-400" />
              <span className="font-semibold text-[11px]">Google Cal Sync</span>
            </div>
            <Sparkles className="w-3.5 h-3.5 text-teal-400" />
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

          {/* User Profile Footer & Working Sign Out Button */}
          {profile && (
            <div className="flex items-center justify-between px-2 pt-1 text-xs">
              <div className="truncate">
                <span className="text-slate-200 font-semibold block truncate text-[11px]">
                  {profile.full_name || profile.email}
                </span>
                <span className="text-[9px] text-teal-400 font-mono uppercase tracking-wider block">
                  {profile.role} • {profile.department || 'Production'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                title="Sign Out of Cadence"
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full overflow-y-auto">
        {activeTab === 'today' && <TodayView onSelectNode={setSelectedNode} />}
        {activeTab === 'browse' && <NodeTree onSelectNode={setSelectedNode} />}
        {activeTab === 'calendar' && <CalendarView onSelectNode={setSelectedNode} />}
        {activeTab === 'admin' && <AdminDashboard />}
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
