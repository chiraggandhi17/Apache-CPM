import { NodeItem } from '../types/domain';

export const DEFAULT_FALLBACK_COLOR = '#0D9488'; // Vibrant Emerald Teal

// Curated palette — kept saturated & clean (zen-friendly, not neon) so that
// every level-gradient derived from them still reads clearly on the calendar.
// NOTE: These hex values intentionally match the palette that has always
// shipped in this app. Existing nodes in the database store one of these
// exact hex strings in their `color` column, and getUnusedProjectColor()
// below decides "is this swatch already used?" by exact hex match — so
// changing these values breaks auto-color-assignment for every new
// Level-1 node (it silently falls back to swatch #1 for everyone). If the
// palette ever needs to change, migrate stored node colors at the same time.
export const CURATED_SWATCHES = [
  { name: 'Emerald Teal', hex: '#0D9488' },
  { name: 'Royal Sapphire', hex: '#2563EB' },
  { name: 'Vivid Amber', hex: '#D97706' },
  { name: 'Electric Violet', hex: '#7C3AED' },
  { name: 'Ruby Crimson', hex: '#E11D48' },
  { name: 'Lush Emerald', hex: '#059669' },
  { name: 'Sunset Orange', hex: '#EA580C' },
  { name: 'Ocean Cyan', hex: '#0891B2' },
  { name: 'Deep Purple', hex: '#9333EA' },
  { name: 'Sky Cerulean', hex: '#0284C7' },
  { name: 'Berry Magenta', hex: '#C026D3' },
  { name: 'Coral Flame', hex: '#F43F5E' },
];

// ── HEX <-> HSL helpers ─────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] | null {
  if (!hex || !hex.startsWith('#')) return null;
  let clean = hex.slice(1);
  if (clean.length === 3) clean = clean.split('').map(c => c + c).join('');
  if (clean.length !== 6) return null;
  const num = parseInt(clean, 16);
  if (isNaN(num)) return null;
  return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  h /= 360; s = Math.min(1, Math.max(0, s / 100)); l = Math.min(1, Math.max(0, l / 100));
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function hexToHsl(hex: string): [number, number, number] | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return rgbToHsl(...rgb);
}

/**
 * Lightens a HEX color for level-gradient shading. Unlike a plain white-mix
 * (which quickly desaturates into pale/dull grays), this works in HSL space:
 * lightness rises steadily while saturation is only trimmed slightly, so
 * deeper hierarchy levels stay bright & readable instead of washing out.
 */
export function lightenColor(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb || percent <= 0) return hex || DEFAULT_FALLBACK_COLOR;

  const [h, s, l] = rgbToHsl(...rgb);
  const factor = Math.min(1, Math.max(0, percent / 100));

  // Push lightness toward a bright ceiling (never fully white) …
  const targetL = Math.min(88, l + (92 - l) * factor);
  // …and only gently soften saturation so color identity survives.
  const targetS = Math.max(38, s * (1 - factor * 0.28));

  const [r, g, b] = hslToRgb(h, targetS, targetL);
  return toHex(r, g, b);
}

/**
 * Calculates level lighten percentage — tuned so 4-5 hierarchy levels each
 * produce a visually distinct, still-vivid shade of the same hue:
 * Level 1 (distance 0): 0%   — full vibrant tone
 * Level 2 (distance 1): 26%  lighter
 * Level 3 (distance 2): 46%  lighter
 * Level 4 (distance 3): 62%  lighter
 * Level 5+ (distance 4+): 74%+ lighter (capped)
 */
export function getLevelLightenPercent(distance: number): number {
  if (distance <= 0) return 0;
  if (distance === 1) return 26;
  if (distance === 2) return 46;
  if (distance === 3) return 62;
  return Math.min(82, 62 + (distance - 3) * 10);
}

/**
 * Pure function: resolveColor
 * Given a node's own color override and an array of ancestor colors ordered from root -> parent,
 * returns the nearest non-null color or fallback gray with level gradient lightening.
 */
export function resolveColor(
  nodeColor: string | null | undefined,
  ancestorColors: (string | null | undefined)[] = []
): string {
  if (nodeColor && nodeColor.trim() !== '') {
    return nodeColor;
  }

  for (let i = ancestorColors.length - 1; i >= 0; i--) {
    const color = ancestorColors[i];
    if (color && color.trim() !== '') {
      const distance = ancestorColors.length - i; // 1 for child, 2 for subchild...
      const percent = getLevelLightenPercent(distance);
      return lightenColor(color, percent);
    }
  }

  return DEFAULT_FALLBACK_COLOR;
}

/**
 * Returns the full level-gradient ladder (level 1 -> level 5+) for a given
 * root/base color. Used for live previews (e.g. in the color picker) so
 * users can see exactly how a chosen color will shade down the hierarchy.
 */
export function getGradientLadder(baseHex: string, levels: number = 5): string[] {
  const ladder: string[] = [];
  for (let i = 0; i < levels; i++) {
    ladder.push(i === 0 ? baseHex : lightenColor(baseHex, getLevelLightenPercent(i)));
  }
  return ladder;
}

/**
 * Given a background color, returns the ideal readable text color
 * (near-black or near-white) using relative luminance.
 */
export function getReadableTextColor(bgHex: string): string {
  const rgb = hexToRgb(bgHex);
  if (!rgb) return '#0f172a';
  const [r, g, b] = rgb.map(v => v / 255);
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.52 ? '#0f172a' : '#ffffff';
}

/**
 * Smart Auto-Distinct Color Selection:
 * Returns the first unused swatch color for a new top-level project to avoid color collisions.
 */
export function getUnusedProjectColor(existingNodes: NodeItem[]): string {
  // Find colors used by top-level or project nodes
  const usedColors = new Set(
    existingNodes
      .filter(n => n.parent_id === null || n.type === 'project' || n.type === 'department')
      .map(n => n.color)
      .filter(Boolean)
  );

  // Pick first unused color from curated palette
  for (const swatch of CURATED_SWATCHES) {
    if (!usedColors.has(swatch.hex)) {
      return swatch.hex;
    }
  }

  // Fallback to random swatch if all swatches are used
  return CURATED_SWATCHES[Math.floor(Math.random() * CURATED_SWATCHES.length)].hex;
}
