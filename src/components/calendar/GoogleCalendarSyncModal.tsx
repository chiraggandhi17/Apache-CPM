import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { generateGoogleCalendarUrl, generateICalSubscriptionUrl, CalendarEventPayload } from '../../utils/calendar-links';
import { FeatureGate } from '../auth/Guards';
import { X, Calendar, ExternalLink, Copy, Check, RefreshCw, Sparkles, Shield, Lock } from 'lucide-react';

interface GoogleCalendarSyncModalProps {
  eventPayload?: CalendarEventPayload | null;
  onClose: () => void;
}

export const GoogleCalendarSyncModal: React.FC<GoogleCalendarSyncModalProps> = ({ eventPayload, onClose }) => {
  const { user, profile } = useAuth();
  const [copiedFeed, setCopiedFeed] = useState(false);
  const [isAutoSyncEnabled, setIsAutoSyncEnabled] = useState(true);

  const directGoogleUrl = eventPayload ? generateGoogleCalendarUrl(eventPayload) : null;
  const iCalFeedUrl = user ? generateICalSubscriptionUrl(user.id) : generateICalSubscriptionUrl('demo-user-1');

  const handleCopyFeed = () => {
    navigator.clipboard.writeText(iCalFeedUrl);
    setCopiedFeed(true);
    setTimeout(() => setCopiedFeed(false), 2500);
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100 flex flex-col max-h-[85vh]">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold flex items-center gap-1.5">
                <span>Google Calendar & iCal Integration</span>
                <span className="text-[9px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-mono border border-amber-500/30">
                  Premium Module
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">Sync Cadence critical path dates directly with your personal or work calendar.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feature Gate Protection */}
        <div className="p-6 space-y-5 flex-1 overflow-y-auto">
          <FeatureGate feature="google_calendar_sync">
            
            {/* Tier 1: Direct 1-Click Google Calendar Event Launcher */}
            {eventPayload && directGoogleUrl && (
              <div className="bg-gradient-to-r from-teal-50 to-emerald-50 p-4 rounded-2xl border border-teal-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-teal-950 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-teal-600" />
                    1-Click Google Calendar Event
                  </span>
                  <span className="text-[10px] bg-teal-200/60 text-teal-900 px-2 py-0.5 rounded-md font-mono font-bold">
                    Instant Launcher
                  </span>
                </div>

                <p className="text-xs text-teal-900">
                  Add <strong className="font-semibold">{eventPayload.title}</strong> directly to your Google Calendar schedule.
                </p>

                <a
                  href={directGoogleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white font-semibold text-xs rounded-xl transition-colors shadow-2xs mt-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open in Google Calendar</span>
                </a>
              </div>
            )}

            {/* Tier 2: Tokenized Live iCal Subscription Feed */}
            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-2.5">
              <span className="text-xs font-bold text-gray-900 block">
                iCal / Webcal Subscription Feed (.ics)
              </span>
              <p className="text-xs text-gray-600 leading-relaxed">
                Subscribe to your Cadence milestone feed in Apple Calendar, Outlook, or Google Calendar. Updates sync automatically when milestone dates shift.
              </p>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={iCalFeedUrl}
                  className="flex-1 text-[11px] font-mono p-2 bg-white border border-gray-300 rounded-xl text-gray-700 truncate outline-none select-all"
                />
                <button
                  type="button"
                  onClick={handleCopyFeed}
                  className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl flex items-center gap-1.5 transition-colors shrink-0 shadow-2xs"
                >
                  {copiedFeed ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedFeed ? 'Copied Feed URL!' : 'Copy Feed URL'}</span>
                </button>
              </div>
            </div>

            {/* Tier 3: Automated Google Calendar OAuth 2-Way Sync Settings */}
            <div className="bg-slate-900 text-slate-100 p-4 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-teal-400" />
                  <span className="text-xs font-bold text-white">Google OAuth 2-Way Auto-Sync</span>
                </div>
                <input
                  type="checkbox"
                  checked={isAutoSyncEnabled}
                  onChange={e => setIsAutoSyncEnabled(e.target.checked)}
                  className="rounded border-slate-700 text-teal-500 focus:ring-teal-500"
                />
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                Automated background push: Whenever a parent milestone date shifts in Cadence, all downstream relative dates automatically update in your Google Calendar in real time.
              </p>

              <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Target Google Account:</span>
                <span className="font-mono text-teal-300 font-semibold">{profile?.email || 'merchandiser@apache.com'}</span>
              </div>
            </div>

          </FeatureGate>
        </div>
      </div>
    </div>
  );
};
