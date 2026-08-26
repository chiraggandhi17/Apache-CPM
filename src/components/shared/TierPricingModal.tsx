import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Check, Sparkles, Zap, Building2, User, X, ArrowRight, ShieldCheck } from 'lucide-react';

interface TierPricingModalProps {
  onClose: () => void;
}

export const TierPricingModal: React.FC<TierPricingModalProps> = ({ onClose }) => {
  const { tier, setTier, isIndividual, organization } = useAuth();

  const handleSelectTier = (selectedTier: 1 | 2 | 3) => {
    setTier(selectedTier);
    onClose();
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
            <h2 className="text-xl font-black text-white">Choose Your Workspace Tier</h2>
            <p className="text-xs text-slate-400">
              Flexible tiers designed for individual professionals, power managers, and enterprise footwear manufacturing organizations.
            </p>
          </div>

          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

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
                    Active Plan
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

            <button
              type="button"
              onClick={() => handleSelectTier(1)}
              disabled={tier === 1}
              className={`w-full mt-6 py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 ${
                tier === 1
                  ? 'bg-slate-800 text-slate-400 cursor-default'
                  : 'bg-teal-500 hover:bg-teal-400 text-slate-950'
              }`}
            >
              <span>{tier === 1 ? 'Current Tier' : 'Switch to Tier 1'}</span>
            </button>
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
                    Active Plan
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

            <button
              type="button"
              onClick={() => handleSelectTier(2)}
              disabled={tier === 2}
              className={`w-full mt-6 py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 ${
                tier === 2
                  ? 'bg-slate-800 text-slate-400 cursor-default'
                  : 'bg-indigo-500 hover:bg-indigo-400 text-slate-950'
              }`}
            >
              <span>{tier === 2 ? 'Current Tier' : 'Upgrade to Pro (Tier 2)'}</span>
            </button>
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
                    Active Plan
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
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-amber-400 shrink-0" /> <strong>Org Admin Center & Database Backups</strong></li>
                </ul>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleSelectTier(3)}
              disabled={tier === 3}
              className={`w-full mt-6 py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 ${
                tier === 3
                  ? 'bg-slate-800 text-slate-400 cursor-default'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
              }`}
            >
              <span>{tier === 3 ? 'Current Tier' : 'Upgrade to Enterprise (Tier 3)'}</span>
            </button>
          </div>

        </div>

        <div className="text-center text-slate-500 text-[11px] pt-2">
          Questions about custom footwear manufacturing deployments? Contact platform support.
        </div>
      </div>
    </div>
  );
};
