import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Organization } from '../../context/AuthContext';
import { Building2, Plus, ShieldCheck, ToggleLeft, ToggleRight, Sparkles, Layers, Palette, Image as ImageIcon, CheckCircle2, Edit3 } from 'lucide-react';

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

export const SuperAdminDashboard: React.FC = () => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingBrandOrg, setEditingBrandOrg] = useState<Organization | null>(null);

  // New Org Form
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgSlug, setNewOrgSlug] = useState('');
  const [newOrgTier, setNewOrgTier] = useState<'starter' | 'pro' | 'enterprise'>('pro');

  // Branding Form
  const [brandTitle, setBrandTitle] = useState('');
  const [brandTagline, setBrandTagline] = useState('');
  const [brandLogoUrl, setBrandLogoUrl] = useState('');
  const [brandColor, setBrandColor] = useState('#0d9488');

  const loadOrganizations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('organizations').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setOrganizations(data || []);
    } catch (err) {
      console.error('Error fetching organizations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrganizations();
  }, []);

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim() || !newOrgSlug.trim()) return;

    try {
      const slug = newOrgSlug.trim().toLowerCase().replace(/\s+/g, '-');
      const newOrg = {
        name: newOrgName.trim(),
        slug,
        subscription_tier: newOrgTier,
        status: 'active',
        brand_title: `Cadence - ${newOrgName.trim()}`,
        brand_tagline: 'Enterprise Ex-Factory CPM Tracker',
        brand_color: '#0d9488',
        features: {
          google_calendar_sync: true,
          advanced_reports: true,
          node_mutation: true,
        },
      };

      const { error } = await supabase.from('organizations').insert(newOrg);
      if (error) throw error;

      setNewOrgName('');
      setNewOrgSlug('');
      setShowCreateModal(false);
      await loadOrganizations();
    } catch (err: any) {
      alert('Error creating organization: ' + err.message);
    }
  };

  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBrandOrg) return;

    try {
      const { error } = await supabase
        .from('organizations')
        .update({
          brand_title: brandTitle.trim() || `Cadence - ${editingBrandOrg.name}`,
          brand_tagline: brandTagline.trim() || 'Enterprise Ex-Factory CPM Tracker',
          logo_url: brandLogoUrl.trim() || null,
          brand_color: brandColor,
        })
        .eq('id', editingBrandOrg.id);

      if (error) throw error;

      setEditingBrandOrg(null);
      await loadOrganizations();
    } catch (err: any) {
      alert('Error saving branding: ' + err.message);
    }
  };

  const handleToggleOrgFeature = async (orgId: string, currentFeatures: Record<string, boolean>, featureKey: string) => {
    const updatedFeatures = {
      ...currentFeatures,
      [featureKey]: !currentFeatures[featureKey],
    };

    try {
      await supabase.from('organizations').update({ features: updatedFeatures }).eq('id', orgId);
      await loadOrganizations();
    } catch (err) {
      console.error('Error toggling org feature:', err);
    }
  };

  const handleUpdateTier = async (orgId: string, newTier: 'starter' | 'pro' | 'enterprise') => {
    try {
      await supabase.from('organizations').update({ subscription_tier: newTier }).eq('id', orgId);
      await loadOrganizations();
    } catch (err) {
      console.error('Error updating tier:', err);
    }
  };

  const openBrandingModal = (org: Organization) => {
    setEditingBrandOrg(org);
    setBrandTitle(org.brand_title || `Cadence - ${org.name}`);
    setBrandTagline(org.brand_tagline || 'Enterprise Ex-Factory CPM Tracker');
    setBrandLogoUrl(org.logo_url || '');
    setBrandColor(org.brand_color || '#0d9488');
  };

  return (
    <div className="space-y-6">
      {/* Platform Owner Header */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-teal-950 text-white p-6 rounded-3xl border border-slate-800 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30 mb-2">
            <ShieldCheck className="w-3.5 h-3.5" /> Super Admin Platform Console
          </div>
          <h1 className="text-xl md:text-2xl font-black tracking-tight">SaaS Organizations & White-Label Custom Branding</h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1 max-w-xl">
            For you the platform is <strong>Cadence</strong>. Set custom co-brand titles (e.g. <em>Cadence - Apache Footwear</em>), company logos, and brand color schemes per client.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2.5 bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-2xl font-bold text-xs shadow-lg shadow-teal-500/20 transition-all flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" /> Add Client Organization
        </button>
      </div>

      {/* Organizations Directory Table */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-2xs overflow-hidden">
        <div className="p-4 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-teal-600" /> Active SaaS Client Organizations ({organizations.length})
          </h2>
          {loading && <span className="text-xs text-gray-400 animate-pulse">Syncing platform DB...</span>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3">Organization & Custom Co-Brand Title</th>
                <th className="px-4 py-3">White-Label Branding</th>
                <th className="px-4 py-3">Subscription Tier</th>
                <th className="px-4 py-3">Feature Module Provisions</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {organizations.map(org => {
                const feats = org.features || { google_calendar_sync: true, advanced_reports: true, node_mutation: true };
                const displayTitle = org.brand_title || `Cadence - ${org.name}`;

                return (
                  <tr key={org.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-gray-900 flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-slate-700" />
                        <span>{org.name}</span>
                      </div>
                      <div className="text-[11px] font-semibold text-teal-700 font-mono mt-0.5">Title: {displayTitle}</div>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-5 h-5 rounded-full border border-gray-300 shadow-2xs shrink-0"
                          style={{ backgroundColor: org.brand_color || '#0d9488' }}
                          title={`Brand Color: ${org.brand_color || '#0d9488'}`}
                        />
                        {org.logo_url ? (
                          <img src={org.logo_url} alt="Org Logo" className="h-5 object-contain" />
                        ) : (
                          <span className="text-[10px] text-gray-400 italic">No logo set</span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <select
                        value={org.subscription_tier}
                        onChange={e => handleUpdateTier(org.id, e.target.value as any)}
                        className="px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl text-xs font-bold shadow-2xs outline-none focus:border-teal-500"
                      >
                        <option value="starter">Starter Plan</option>
                        <option value="pro">Pro Tier</option>
                        <option value="enterprise">Enterprise Tier</option>
                      </select>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {['google_calendar_sync', 'advanced_reports', 'node_mutation'].map(fKey => {
                          const isEnabled = Boolean(feats[fKey]);
                          return (
                            <button
                              key={fKey}
                              type="button"
                              onClick={() => handleToggleOrgFeature(org.id, feats, fKey)}
                              className={`px-2.5 py-1 rounded-xl text-[10px] font-semibold border flex items-center gap-1 transition-all ${
                                isEnabled
                                  ? 'bg-teal-50 text-teal-800 border-teal-300 shadow-2xs'
                                  : 'bg-gray-100 text-gray-400 border-gray-200'
                              }`}
                            >
                              <span>{fKey.replace(/_/g, ' ')}</span>
                              {isEnabled ? <ToggleRight className="w-3.5 h-3.5 text-teal-600" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                            </button>
                          );
                        })}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => openBrandingModal(org)}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs shadow-2xs transition-colors flex items-center gap-1 ml-auto"
                      >
                        <Palette className="w-3.5 h-3.5 text-teal-400" />
                        <span>Edit Branding</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Organization Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-gray-200 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Add New SaaS Client Organization</h2>
            
            <form onSubmit={handleCreateOrganization} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Organization Name</label>
                <input
                  type="text"
                  required
                  value={newOrgName}
                  onChange={e => {
                    setNewOrgName(e.target.value);
                    setNewOrgSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'));
                  }}
                  placeholder="e.g. Adidas Factory Taiwan"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Organization Slug</label>
                <input
                  type="text"
                  required
                  value={newOrgSlug}
                  onChange={e => setNewOrgSlug(e.target.value)}
                  placeholder="e.g. adidas-taiwan"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl font-mono text-gray-600 outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Subscription Tier</label>
                <select
                  value={newOrgTier}
                  onChange={e => setNewOrgTier(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl outline-none focus:border-teal-500 font-semibold"
                >
                  <option value="starter">Starter Tier</option>
                  <option value="pro">Pro Tier</option>
                  <option value="enterprise">Enterprise Tier</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
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
                  Create Organization
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Branding Modal */}
      {editingBrandOrg && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-gray-200 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Palette className="w-5 h-5 text-teal-600" />
                <span>White-Label Branding: {editingBrandOrg.name}</span>
              </h2>
              <button onClick={() => setEditingBrandOrg(null)} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveBranding} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-800 mb-1">Co-Brand Software Title</label>
                <input
                  type="text"
                  required
                  value={brandTitle}
                  onChange={e => setBrandTitle(e.target.value)}
                  placeholder="e.g. Cadence - Apache Footwear"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:border-teal-500 font-bold text-gray-900"
                />
                <span className="text-[10px] text-gray-500 mt-1 block">
                  This title appears on the client's sidebar header and browser document tab.
                </span>
              </div>

              <div>
                <label className="block font-bold text-gray-800 mb-1">Company Subtitle / Tagline</label>
                <input
                  type="text"
                  value={brandTagline}
                  onChange={e => setBrandTagline(e.target.value)}
                  placeholder="e.g. adidas Ex-Factory Production Critical Path Tracker"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-800 mb-1">Company Logo Image URL</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={brandLogoUrl}
                    onChange={e => setBrandLogoUrl(e.target.value)}
                    placeholder="https://example.com/logo.png"
                    className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl font-mono outline-none focus:border-teal-500"
                  />
                  {brandLogoUrl && (
                    <div className="w-10 h-10 border border-gray-200 rounded-xl flex items-center justify-center p-1 bg-white shrink-0">
                      <img src={brandLogoUrl} alt="Preview" className="max-h-full max-w-full object-contain" />
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-800 mb-1.5">Primary Brand Accent Color Palette</label>
                <div className="grid grid-cols-4 gap-2">
                  {BRAND_PALETTES.map(p => (
                    <button
                      key={p.hex}
                      type="button"
                      onClick={() => setBrandColor(p.hex)}
                      className={`p-2 rounded-xl border text-[10px] font-semibold flex items-center gap-1.5 transition-all ${
                        brandColor === p.hex ? 'border-slate-900 ring-2 ring-slate-900/20 bg-gray-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: p.hex }} />
                      <span className="truncate">{p.name.split(' ')[0]}</span>
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <span className="text-gray-600 font-semibold">Custom HEX:</span>
                  <input
                    type="color"
                    value={brandColor}
                    onChange={e => setBrandColor(e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer border border-gray-300 p-0"
                  />
                  <span className="font-mono text-gray-700 font-bold">{brandColor}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEditingBrandOrg(null)}
                  className="px-4 py-2 text-gray-600 font-semibold rounded-xl hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-2xs"
                >
                  Save Branding Configurations
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
