import { describe, it, expect } from 'vitest';
import { resolveColor, getUnusedProjectColor, DEFAULT_FALLBACK_COLOR, CURATED_SWATCHES } from '../src/lib/color-resolver';
import { NodeItem } from '../src/types/domain';

describe('Color Resolver Pure Function (resolveColor)', () => {
  it('should return node own color when defined', () => {
    const color = resolveColor('#0D9488', ['#2563EB']);
    expect(color).toBe('#0D9488');
  });

  it('should inherit nearest parent color when node color is null', () => {
    const color = resolveColor(null, ['#2563EB', '#0D9488']);
    expect(color).toBe('#0D9488');
  });

  it('should inherit root color when intermediate ancestors are null', () => {
    const color = resolveColor(null, ['#2563EB', null, undefined]);
    expect(color).toBe('#2563EB');
  });

  it('should return default fallback color when no ancestor has color', () => {
    const color = resolveColor(null, [null, undefined]);
    expect(color).toBe(DEFAULT_FALLBACK_COLOR);
  });

  it('should pick an unused color for new project nodes to avoid color collision', () => {
    const existingNodes: Partial<NodeItem>[] = [
      { id: '1', parent_id: null, type: 'project', color: '#0D9488' }, // Teal used
      { id: '2', parent_id: null, type: 'project', color: '#2563EB' }, // Blue used
    ];

    const nextColor = getUnusedProjectColor(existingNodes as NodeItem[]);
    // Should pick Orange (#F97316), the 3rd swatch
    expect(nextColor).toBe('#F97316');
    expect(nextColor).not.toBe('#0D9488');
    expect(nextColor).not.toBe('#2563EB');
  });
});
