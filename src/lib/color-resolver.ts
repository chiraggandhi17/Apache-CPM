import { NodeItem } from '../types/domain';

export const DEFAULT_FALLBACK_COLOR = '#0D9488'; // Vibrant Emerald Teal

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

/**
 * Lightens a HEX color by a given percentage (0 to 100) while keeping color clean and vibrant
 */
export function lightenColor(hex: string, percent: number): string {
  if (!hex || !hex.startsWith('#') || percent <= 0) return hex || DEFAULT_FALLBACK_COLOR;
  let cleanHex = hex.slice(1);
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('');
  }
  
  let num = parseInt(cleanHex, 16);
  if (isNaN(num)) return hex;

  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;

  // Mix with white (#ffffff)
  const factor = Math.min(0.78, Math.max(0, percent / 100));
  r = Math.round(r + (255 - r) * factor);
  g = Math.round(g + (255 - g) * factor);
  b = Math.round(b + (255 - b) * factor);

  const toHex = (c: number) => c.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Calculates level lighten percentage:
 * Level 1 (distance 0): 0% (full vibrant tone)
 * Level 2 (distance 1): 20% lighter
 * Level 3 (distance 2): 38% lighter
 * Level 4 (distance 3): 54% lighter
 * Level 5+ (distance 4+): 68% lighter
 */
export function getLevelLightenPercent(distance: number): number {
  if (distance <= 0) return 0;
  if (distance === 1) return 20;
  if (distance === 2) return 38;
  if (distance === 3) return 54;
  return Math.min(75, 54 + (distance - 3) * 12);
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

