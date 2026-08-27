// ─────────────────────────────────────────────────────────
//  Cadence CPM — Design Token System
//  3 selectable themes: Warm Sand (default), Cool Slate, Midnight
// ─────────────────────────────────────────────────────────

export type ThemeId = 'warm-sand' | 'cool-slate' | 'midnight';

export interface ThemeTokens {
  id: ThemeId;
  label: string;
  emoji: string;
  // Canvas & Cards
  canvasBg: string;
  cardBg: string;
  cardBorder: string;
  // Sidebar
  sidebarBg: string;
  sidebarText: string;
  sidebarTextMuted: string;
  sidebarHover: string;
  sidebarActive: string;
  sidebarActiveText: string;
  sidebarBorder: string;
  sidebarSectionLabel: string;
  // Accent
  accent: string;
  accentSubtle: string;
  accentHover: string;
  accentSecondary: string;
  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  // Borders
  border: string;
  borderSubtle: string;
  // Inputs
  inputBg: string;
  inputBorder: string;
  inputFocusBorder: string;
  // Misc
  badgeBg: string;
  headerGradientFrom: string;
  headerGradientTo: string;
}

export const themes: Record<ThemeId, ThemeTokens> = {
  'warm-sand': {
    id: 'warm-sand',
    label: 'Warm Sand',
    emoji: '🏜️',
    canvasBg: '#FAF8F5',
    cardBg: '#FFFFFF',
    cardBorder: '#DED7CC',
    sidebarBg: '#2C2825',
    sidebarText: '#D4CDC4',
    sidebarTextMuted: '#8C857C',
    sidebarHover: '#3D3833',
    sidebarActive: '#C4704B',
    sidebarActiveText: '#FFFFFF',
    sidebarBorder: '#3D3833',
    sidebarSectionLabel: '#8C857C',
    accent: '#C4704B',
    accentSubtle: 'rgba(196,112,75,0.1)',
    accentHover: '#B5623F',
    accentSecondary: '#6B8F71',
    textPrimary: '#2C2825',
    textSecondary: '#8C857C',
    textMuted: '#A39B8F',
    border: '#DED7CC',
    borderSubtle: '#EAE4DA',
    inputBg: '#FAF8F5',
    inputBorder: '#DED7CC',
    inputFocusBorder: '#C4704B',
    badgeBg: '#F5F0EB',
    headerGradientFrom: '#3D3530',
    headerGradientTo: '#2C2825',
  },
  'cool-slate': {
    id: 'cool-slate',
    label: 'Cool Slate',
    emoji: '🧊',
    canvasBg: '#F7F8FA',
    cardBg: '#FFFFFF',
    cardBorder: '#D5D9E0',
    sidebarBg: '#1E293B',
    sidebarText: '#CBD5E1',
    sidebarTextMuted: '#64748B',
    sidebarHover: '#334155',
    sidebarActive: '#6366F1',
    sidebarActiveText: '#FFFFFF',
    sidebarBorder: '#334155',
    sidebarSectionLabel: '#64748B',
    accent: '#6366F1',
    accentSubtle: 'rgba(99,102,241,0.1)',
    accentHover: '#4F46E5',
    accentSecondary: '#F59E0B',
    textPrimary: '#1E293B',
    textSecondary: '#64748B',
    textMuted: '#82909F',
    border: '#D5D9E0',
    borderSubtle: '#E7EBF0',
    inputBg: '#F7F8FA',
    inputBorder: '#D5D9E0',
    inputFocusBorder: '#6366F1',
    badgeBg: '#F1F5F9',
    headerGradientFrom: '#334155',
    headerGradientTo: '#1E293B',
  },
  midnight: {
    id: 'midnight',
    label: 'Midnight',
    emoji: '🌙',
    canvasBg: '#18181B',
    cardBg: '#27272A',
    cardBorder: '#4A4A52',
    sidebarBg: '#0F0F12',
    sidebarText: '#A1A1AA',
    sidebarTextMuted: '#71717A',
    sidebarHover: '#27272A',
    sidebarActive: '#A78BFA',
    sidebarActiveText: '#18181B',
    sidebarBorder: '#27272A',
    sidebarSectionLabel: '#71717A',
    accent: '#A78BFA',
    accentSubtle: 'rgba(167,139,250,0.1)',
    accentHover: '#8B5CF6',
    accentSecondary: '#5EEAD4',
    textPrimary: '#FAFAFA',
    textSecondary: '#A1A1AA',
    textMuted: '#86868F',
    border: '#4A4A52',
    borderSubtle: '#323236',
    inputBg: '#27272A',
    inputBorder: '#4A4A52',
    inputFocusBorder: '#A78BFA',
    badgeBg: '#3F3F46',
    headerGradientFrom: '#27272A',
    headerGradientTo: '#18181B',
  },
};

export const THEME_IDS: ThemeId[] = ['warm-sand', 'cool-slate', 'midnight'];
export const DEFAULT_THEME: ThemeId = 'warm-sand';

/** Apply a theme by injecting CSS custom properties onto :root */
export function applyTheme(themeId: ThemeId): void {
  const t = themes[themeId];
  if (!t) return;

  const props: Record<string, string> = {
    '--canvas-bg': t.canvasBg,
    '--card-bg': t.cardBg,
    '--card-border': t.cardBorder,
    '--sidebar-bg': t.sidebarBg,
    '--sidebar-text': t.sidebarText,
    '--sidebar-text-muted': t.sidebarTextMuted,
    '--sidebar-hover': t.sidebarHover,
    '--sidebar-active': t.sidebarActive,
    '--sidebar-active-text': t.sidebarActiveText,
    '--sidebar-border': t.sidebarBorder,
    '--sidebar-section-label': t.sidebarSectionLabel,
    '--accent': t.accent,
    '--accent-subtle': t.accentSubtle,
    '--accent-hover': t.accentHover,
    '--accent-secondary': t.accentSecondary,
    '--text-primary': t.textPrimary,
    '--text-secondary': t.textSecondary,
    '--text-muted': t.textMuted,
    '--border': t.border,
    '--border-subtle': t.borderSubtle,
    '--input-bg': t.inputBg,
    '--input-border': t.inputBorder,
    '--input-focus-border': t.inputFocusBorder,
    '--badge-bg': t.badgeBg,
    '--header-gradient-from': t.headerGradientFrom,
    '--header-gradient-to': t.headerGradientTo,
  };

  const root = document.documentElement;
  for (const [key, value] of Object.entries(props)) {
    root.style.setProperty(key, value);
  }
}
