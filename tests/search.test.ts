import { describe, it, expect } from 'vitest';
import { matchesSearchQuery } from '../src/utils/search';
import { NodeItem } from '../src/types/domain';

describe('Deep Multi-Field Search Engine (matchesSearchQuery)', () => {
  const sampleNodes: Partial<NodeItem>[] = [
    {
      id: 'n1',
      title: 'Material A in-house (Mesh Upper)',
      assignee: 'Alex (Purchasing)',
      vendor_contact: 'supplier-x@footwear-materials.com',
      description: 'Batch #8822 delivery expected',
      planned_date: '2026-10-10T00:00:00.000Z',
    },
  ];

  it('should match node by title substring', () => {
    expect(matchesSearchQuery(sampleNodes[0] as NodeItem, 'Mesh Upper', sampleNodes as NodeItem[])).toBe(true);
  });

  it('should match node by vendor contact', () => {
    expect(matchesSearchQuery(sampleNodes[0] as NodeItem, 'supplier-x', sampleNodes as NodeItem[])).toBe(true);
  });

  it('should match node by assignee', () => {
    expect(matchesSearchQuery(sampleNodes[0] as NodeItem, 'Alex', sampleNodes as NodeItem[])).toBe(true);
  });

  it('should match node by month name (e.g. October)', () => {
    expect(matchesSearchQuery(sampleNodes[0] as NodeItem, 'October', sampleNodes as NodeItem[])).toBe(true);
    expect(matchesSearchQuery(sampleNodes[0] as NodeItem, 'Oct', sampleNodes as NodeItem[])).toBe(true);
  });

  it('should match node by description notes', () => {
    expect(matchesSearchQuery(sampleNodes[0] as NodeItem, 'Batch #8822', sampleNodes as NodeItem[])).toBe(true);
  });
});
