import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNodes } from '../../context/NodeContext';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../lib/supabase';
import { themes, THEME_IDS, type ThemeId } from '../../lib/theme';
import { playNotificationSound } from '../../utils/sound';
import { 
  Settings, User, Bell, Volume2, Download, Upload, Trash2, 
  RefreshCw, Check, AlertTriangle, X, Shield, Sparkles, Sliders, Palette
} from 'lucide-react';

interface PersonalUserSettingsModalProps {
  onClose: () => void;
}

export const PersonalUserSettingsModal: React.FC<PersonalUserSettingsModalProps> = ({ onClose }) => {
  const { profile, refreshProfile, tier } = useAuth();
  const { nodes, reminders, deleteNode } = useNodes();
  const { themeId, setTheme } = useTheme();

  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('cadence_sound_enabled') !== 'false';
  });
  const [defaultSnooze, setDefaultSnooze] = useState(() => {
    return localStorage.getItem('cadence_default_snooze') || '1d';
  });

  const [savingProfile, setSavingProfile] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [clearingData, setClearingData] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.id) return;

    setSavingProfile(true);
    try {
      await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);

      localStorage.setItem('cadence_sound_enabled', soundEnabled ? 'true' : 'false');
      localStorage.setItem('cadence_default_snooze', defaultSnooze);

      await refreshProfile();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      alert('Failed to save settings: ' + err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleTestChime = () => {
    playNotificationSound();
  };

  const handleExportData = () => {
    const exportPackage = {
      app: 'Cadence CPM Personal',
      exported_at: new Date().toISOString(),
      user: {
        email: profile?.email,
        full_name: profile?.full_name,
        tier: tier === 1 ? 'Personal (Free)' : tier === 2 ? 'Pro' : 'Enterprise',
      },
      nodes_count: nodes.length,
      reminders_count: reminders.length,
      nodes,
      reminders,
    };

    const blob = new Blob([JSON.stringify(exportPackage, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cadence_personal_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClearAllData = async () => {
    const confirmation = prompt(
      `⚠️ CAUTION: This will permanently delete ALL ${nodes.length} tasks and ${reminders.length} alerts from your personal workspace.\n\nType "RESET" to confirm permanent deletion:`
    );

    if (confirmation !== 'RESET') {
      if (confirmation !== null) alert('Reset cancelled: You did not type "RESET".');
      return;
    }

    setClearingData(true);
    try {
      // Delete all reminders
      for (const rem of reminders) {
        await supabase.from('reminders').delete().eq('id', rem.id);
      }

      // Delete all nodes
      for (const node of nodes) {
        await supabase.from('nodes').delete().eq('id', node.id);
      }

      window.location.reload();
    } catch (err: any) {
      alert('Error resetting data: ' + err.message);
      setClearingData(false);
    }
  };

  return (
    <div className="fixed inset-0 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
      <div className="rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto text-xs" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)', border: '1px solid var(--border)' }}>
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-200">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Personal Workspace Settings</h2>
              <p className="text-[11px] text-gray-500">{profile?.email}</p>
            </div>
          </div>

          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {saveSuccess && (
          <div className="p-3 bg-emerald-50 text-emerald-800 rounded-2xl border border-emerald-200 font-bold flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600" /> Settings saved successfully!
          </div>
        )}

        {/* ──── THEME PICKER ──── */}
        <div className="space-y-3">
          <h3 className="font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
            <Palette className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} /> Appearance Theme
          </h3>

          <div className="grid grid-cols-3 gap-2.5">
            {THEME_IDS.map((id) => {
              const t = themes[id];
              const isActive = themeId === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTheme(id)}
                  className={`p-3 rounded-xl border-2 transition-all text-left relative ${
                    isActive
                      ? 'ring-2 shadow-md'
                      : 'hover:shadow-sm'
                  }`}
                  style={{
                    borderColor: isActive ? t.accent : t.cardBorder,
                    backgroundColor: t.canvasBg,
                    ...(isActive ? { ringColor: t.accent } : {}),
                  }}
                >
                  {/* Mini preview */}
                  <div className="flex gap-1.5 mb-2.5 h-8 rounded-md overflow-hidden border" style={{ borderColor: t.cardBorder }}>
                    {/* Sidebar strip */}
                    <div className="w-5 shrink-0" style={{ backgroundColor: t.sidebarBg }}>
                      <div className="w-2.5 h-1 mt-1.5 mx-auto rounded-sm" style={{ backgroundColor: t.sidebarActive }} />
                      <div className="w-2.5 h-0.5 mt-1 mx-auto rounded-sm" style={{ backgroundColor: t.sidebarTextMuted }} />
                      <div className="w-2.5 h-0.5 mt-0.5 mx-auto rounded-sm" style={{ backgroundColor: t.sidebarTextMuted }} />
                    </div>
                    {/* Content area */}
                    <div className="flex-1 p-1" style={{ backgroundColor: t.canvasBg }}>
                      <div className="w-full h-1.5 rounded-sm mb-0.5" style={{ backgroundColor: t.border }} />
                      <div className="w-3/4 h-1 rounded-sm" style={{ backgroundColor: t.border }} />
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold" style={{ color: t.textPrimary }}>{t.emoji} {t.label}</span>
                  </div>

                  {isActive && (
                    <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: t.accent }}>
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Profile Settings Form */}
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="space-y-3">
            <h3 className="font-bold text-gray-800 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-teal-600" /> Account & Profile
            </h3>

            <div>
              <label className="block font-bold text-gray-700 mb-1">Your Display Name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="e.g. Alex Johnson"
                className="w-full h-9 px-3 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:border-teal-500 font-semibold"
              />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">Registered Email (Read-Only)</label>
              <input
                type="email"
                disabled
                value={profile?.email || ''}
                className="w-full h-9 px-3 bg-gray-100 border border-gray-200 rounded-xl font-mono text-gray-500 cursor-not-allowed"
              />
            </div>
          </div>

          {/* Sound & Alert Preferences */}
          <div className="space-y-3 pt-3 border-t border-gray-100">
            <h3 className="font-bold text-gray-800 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5 text-amber-500" /> Audio Chimes & Alert Defaults
            </h3>

            <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200 flex items-center justify-between">
              <div>
                <span className="font-bold text-gray-900 block">Milestone Audio Chimes</span>
                <span className="text-[11px] text-gray-500 block">Play sound alert when reminders and milestones are due</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTestChime}
                  className="px-2.5 py-1 bg-white border border-gray-300 hover:bg-gray-100 rounded-lg text-[11px] font-bold text-gray-700 flex items-center gap-1 shadow-2xs"
                >
                  <Volume2 className="w-3.5 h-3.5 text-teal-600" /> Test Chime
                </button>

                <button
                  type="button"
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 ${
                    soundEnabled ? 'bg-teal-600 justify-end' : 'bg-gray-300 justify-start'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-white shadow-sm block" />
                </button>
              </div>
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">Default Reminder Snooze Interval</label>
              <select
                value={defaultSnooze}
                onChange={e => setDefaultSnooze(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-gray-300 rounded-xl font-semibold outline-none focus:border-teal-500"
              >
                <option value="1h">1 Hour</option>
                <option value="1d">1 Day (Default)</option>
                <option value="3d">3 Days</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={savingProfile}
              className="h-9 px-5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{savingProfile ? 'Saving...' : 'Save Preferences'}</span>
            </button>
          </div>
        </form>

        {/* Data Backup & Reset */}
        <div className="space-y-3 pt-3 border-t border-gray-100">
          <h3 className="font-bold text-gray-800 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5 text-indigo-600" /> Data Backup & Workspace Reset
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={handleExportData}
              className="p-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-2xl flex items-center justify-between text-left transition-colors"
            >
              <div>
                <span className="font-bold text-gray-900 block">Export JSON Backup</span>
                <span className="text-[10px] text-gray-500">{nodes.length} tasks & alerts</span>
              </div>
              <Download className="w-4 h-4 text-teal-600" />
            </button>

            <button
              type="button"
              onClick={handleClearAllData}
              disabled={clearingData}
              className="p-3 bg-rose-50 hover:bg-rose-100/80 border border-rose-200 rounded-2xl flex items-center justify-between text-left transition-colors"
            >
              <div>
                <span className="font-bold text-rose-900 block">Clear / Reset All Data</span>
                <span className="text-[10px] text-rose-700">Wipe personal tasks</span>
              </div>
              <Trash2 className="w-4 h-4 text-rose-600" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
