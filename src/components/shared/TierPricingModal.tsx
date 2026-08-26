import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Check, Sparkles, Zap, Building2, User, X, ArrowRight, ShieldCheck, Clock, Send } from 'lucide-react';

interface TierPricingModalProps {
  onClose: () => void;
}

export const TierPricingModal: React.FC<TierPricingModalProps> = ({ onClose }) => {
  const { tier, setTier, isIndividual, profile, organization, isSuperAdmin } = useAuth();
  
  const [submittingTier, setSubmittingTier] = useState<number | null>(null);
  const [requestSubmitted, setRequestSubmitted] = useState<string | null>(null);

  const handleRequestUpgrade = async (targetTier: 1 | 2 | 3) => {
    // If Super Admin, allow instant testing switch
    if (isSuperAdmin) {
      setTier(targetTier);
      onClose();
      return;
    }

    setSubmittingTier(targetTier);
    try {
      const tierMap: Record<number, string> = { 1: 'tier_1', 2: 'tier_2', 3: 'tier_3' };
      const tierNames: Record<number, string> = { 1: 'Tier 1: Personal', 2: 'Tier 2: Pro Power User', 3: 'Tier 3: Enterprise Organization' };

      const { error } = await supabase.from('tier_upgrade_requests').insert({
        user_id: profile?.id || null,
        user_email: profile?.email || 'user@cadence.app',
        user_name: profile?.full_name || null,
        org_id: profile?.org_id || null,
        org_name: organization?.name || null,
        requested_tier: tierMap[targetTier],
        current_tier: tierMap[tier],
        status: 'pending',
        notes: `User requested upgrade to ${tierNames[targetTier]}`,
      });

      if (error) throw error;
      setRequestSubmitted(tierNames[targetTier]);
    } catch (err: any) {
      alert('Failed to submit upgrade request: ' + err.message);
    } finally {
      setSubmittingTier(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-4xl w-full shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto text-white">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30 mb-1">
              <Sparkles className="w-3 h-3" /> Cadence CPM Plans & Tiers
            </div>
            <h2 className="text-xl font-black text-white">Cadence Workspace Tiers</h2>
            <p className="text-xs text-slate-400">
              Explore capabilities across Personal, Pro, and Enterprise Organization tiers.
            </p>
          </div>

          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Upgrade Request Success Banner */}
        {requestSubmitted && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-2xl text-emerald-300 text-xs flex items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                ✓
              </div>
              <div>
                <p className="font-bold text-white text-sm">Upgrade Request Sent to Platform Admin!</p>
                <p className="text-[11px] text-slate-300">
                  Your request for <strong>{requestSubmitted}</strong> has been logged. The Platform Administrator will review and activate your plan.
                </p>
              </div>
            </div>
            <button
              onClick={() => setRequestSubmitted(null)}
              className="text-emerald-400 hover:text-emerald-200 text-xs font-bold underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 3 Tiers Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          
          {/* TIER 1: PERSONAL STARTER */}
          <div className={`p-5 rounded-3xl border flex flex-col justify-between transition-all ${
            tier === 1 
              ? 'border-teal-400 bg-slate-850 ring-2 ring-teal-400/20 shadow-lg' 
              : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
          }`}>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="p-2 rounded-2xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
                  <User className="w-5 h-5" />
                </span>
                {tier === 1 && (
                  <span className="text-[10px] font-bold bg-teal-500 text-slate-950 px-2 py-0.5 rounded-full">
                    Current Active Tier
                  </span>
                )}
              </div>

              <div>
                <h3 className="text-base font-bold text-white">Tier 1: Personal Starter</h3>
                <div className="text-2xl font-black text-teal-300 mt-1">Free</div>
                <p className="text-slate-400 text-[11px] mt-1">
                  Zero-friction personal task & critical path milestone management for individual professionals.
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <div className="font-bold text-slate-300 text-[11px]">Included Capabilities:</div>
                <ul className="space-y-1.5 text-slate-300 text-[11px]">
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-teal-400 shrink-0" /> Recursive task & milestone trees</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-teal-400 shrink-0" /> Relative date offset auto-cascade</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-teal-400 shrink-0" /> FullCalendar (Month, Week, Day)</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-teal-400 shrink-0" /> Today & Upcoming action feeds</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-teal-400 shrink-0" /> Personal date alerts & chimes</li>
                </ul>
              </div>
            </div>

            <div className="mt-6">
              {tier === 1 ? (
                <div className="w-full py-2.5 rounded-xl bg-slate-800 text-slate-400 text-center font-bold">
                  Active Plan
                </div>
              ) : isSuperAdmin ? (
                <button
                  type="button"
                  onClick={() => handleRequestUpgrade(1)}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold transition-all"
                >
                  Switch to Tier 1 (Admin Dev)
                </button>
              ) : (
                <div className="w-full py-2.5 rounded-xl bg-slate-850 text-slate-500 text-center font-semibold">
                  Included in your plan
                </div>
              )}
            </div>
          </div>

          {/* TIER 2: PRO POWER USER */}
          <div className={`p-5 rounded-3xl border flex flex-col justify-between transition-all ${
            tier === 2 
              ? 'border-indigo-400 bg-slate-850 ring-2 ring-indigo-400/20 shadow-lg' 
              : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
          }`}>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="p-2 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Zap className="w-5 h-5" />
                </span>
                {tier === 2 && (
                  <span className="text-[10px] font-bold bg-indigo-500 text-slate-950 px-2 py-0.5 rounded-full">
                    Current Active Tier
                  </span>
                )}
              </div>

              <div>
                <h3 className="text-base font-bold text-white">Tier 2: Pro Power User</h3>
                <div className="text-2xl font-black text-indigo-300 mt-1">$9 <span className="text-xs text-slate-400 font-normal">/ mo</span></div>
                <p className="text-slate-400 text-[11px] mt-1">
                  For consultants, project managers, and power users who need calendar integrations and analytics.
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <div className="font-bold text-slate-300 text-[11px]">Everything in Tier 1, plus:</div>
                <ul className="space-y-1.5 text-slate-300 text-[11px]">
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" /> <strong>2-Way Google Calendar Sync</strong></li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" /> <strong>Critical Path Variance & Delay Analytics</strong></li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" /> Bottleneck diagnostics reports</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" /> Custom color palettes & tag filters</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" /> Milestone export (ICS / JSON)</li>
                </ul>
              </div>
            </div>

            <div className="mt-6">
              {tier === 2 ? (
                <div className="w-full py-2.5 rounded-xl bg-slate-800 text-slate-400 text-center font-bold">
                  Active Plan
                </div>
              ) : isSuperAdmin ? (
                <button
                  type="button"
                  onClick={() => handleRequestUpgrade(2)}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all"
                >
                  Activate Tier 2 (Admin Dev)
                </button>
              ) : (
                <button
                  type="button"
                  disabled={submittingTier === 2}
                  onClick={() => handleRequestUpgrade(2)}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-600/20"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submittingTier === 2 ? 'Submitting...' : 'Request Pro Upgrade'}</span>
                </button>
              )}
            </div>
          </div>

          {/* TIER 3: ENTERPRISE ORGANIZATION */}
          <div className={`p-5 rounded-3xl border flex flex-col justify-between transition-all ${
            tier === 3 
              ? 'border-amber-400 bg-slate-850 ring-2 ring-amber-400/20 shadow-lg' 
              : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
          }`}>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="p-2 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Building2 className="w-5 h-5" />
                </span>
                {tier === 3 && (
                  <span className="text-[10px] font-bold bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full">
                    Current Active Tier
                  </span>
                )}
              </div>

              <div>
                <h3 className="text-base font-bold text-white">Tier 3: Enterprise Organization</h3>
                <div className="text-2xl font-black text-amber-300 mt-1">$29 <span className="text-xs text-slate-400 font-normal">/ mo</span></div>
                <p className="text-slate-400 text-[11px] mt-1">
                  Full multi-tenant suite for factories (Apache Footwear), brands (Nike/adidas), and multi-department teams.
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <div className="font-bold text-slate-300 text-[11px]">Everything in Tier 1 & 2, plus:</div>
                <ul className="space-y-1.5 text-slate-300 text-[11px]">
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-amber-400 shrink-0" /> <strong>Dedicated Workspace Code</strong> (e.g. APACHE)</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-amber-400 shrink-0" /> <strong>White-Label Co-Branding</strong> (Custom logo & colors)</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-amber-400 shrink-0" /> <strong>Visual Org Hierarchy & Team Access Levels</strong></li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-amber-400 shrink-0" /> <strong>Level 1 / Level 2 / Level 3 Access Governance</strong></li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-amber-400 shrink-0" /> <strong>Cross-Department Visibility & Audit Logs</strong></li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-amber-400 shrink-0" /> <strong>Org Admin Center & Direct Employee Provisioning</strong></li>
                </ul>
              </div>
            </div>

            <div className="mt-6">
              {tier === 3 ? (
                <div className="w-full py-2.5 rounded-xl bg-slate-800 text-slate-400 text-center font-bold">
                  Active Plan
                </div>
              ) : isSuperAdmin ? (
                <button
                  type="button"
                  onClick={() => handleRequestUpgrade(3)}
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all"
                >
                  Activate Tier 3 (Admin Dev)
                </button>
              ) : (
                <button
                  type="button"
                  disabled={submittingTier === 3}
                  onClick={() => handleRequestUpgrade(3)}
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/20"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submittingTier === 3 ? 'Submitting...' : 'Request Enterprise Upgrade'}</span>
                </button>
              )}
            </div>
          </div>

        </div>

        <div className="text-center text-slate-500 text-[11px] pt-2">
          Tier changes are approved by Platform Administrators to maintain system security and enterprise integrity.
        </div>
      </div>
    </div>
  );
};
