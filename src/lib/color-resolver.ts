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
 * Pure function: resolveColor
 * Given a node's own color override and an array of ancestor colors ordered from root -> parent,
 * returns the nearest non-null color or fallback gray.
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
      return color;
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
