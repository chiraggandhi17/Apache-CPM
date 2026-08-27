import { NodeItem } from '../types/domain';

export const DEFAULT_FALLBACK_COLOR = '#6B7280'; // gray-500

export const CURATED_SWATCHES = [
  { name: 'Teal', hex: '#0D9488' },
  { name: 'Blue', hex: '#2563EB' },
  { name: 'Orange', hex: '#F97316' },
  { name: 'Purple', hex: '#8B5CF6' },
  { name: 'Red', hex: '#EF4444' },
  { name: 'Green', hex: '#22C55E' },
  { name: 'Indigo', hex: '#6366F1' },
  { name: 'Amber', hex: '#EAB308' },
  { name: 'Sky', hex: '#0EA5E9' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Rose', hex: '#F43F5E' },
  { name: 'Gray', hex: '#6B7280' },
];

/**
 * Lightens a HEX color by a given percentage (0 to 100)
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
  const factor = Math.min(0.6, Math.max(0, percent / 100));
  r = Math.round(r + (255 - r) * factor);
  g = Math.round(g + (255 - g) * factor);
  b = Math.round(b + (255 - b) * factor);

  const toHex = (c: number) => c.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
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
      return lightenColor(color, distance * 12);
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

  // Fallback to random swatch if all 12 are used
  return CURATED_SWATCHES[Math.floor(Math.random() * CURATED_SWATCHES.length)].hex;
}
