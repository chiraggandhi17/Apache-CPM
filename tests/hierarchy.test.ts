import { describe, it, expect } from 'vitest';
import { getAncestorPath, getSiblingNodes } from '../src/utils/hierarchy';
import { NodeItem } from '../src/types/domain';

describe('Hierarchy Utilities (getAncestorPath & getSiblingNodes)', () => {
  const sampleNodes: Partial<NodeItem>[] = [
    { id: 'dept-1', parent_id: null, title: 'Production', type: 'department', sort_order: 1 },
    { id: 'season-1', parent_id: 'dept-1', title: 'SS26', type: 'season', sort_order: 1 },
    { id: 'proj-1', parent_id: 'season-1', title: 'Model X', type: 'project', sort_order: 1 },
    { id: 'task-1', parent_id: 'proj-1', title: 'Start Production', type: 'task', sort_order: 1 },
    { id: 'task-2', parent_id: 'proj-1', title: 'QC Inspection', type: 'task', sort_order: 2 },
    { id: 'subtask-1', parent_id: 'task-1', title: 'Material A', type: 'subtask', sort_order: 1 },
  ];

  it('should build full root-to-node ancestor path', () => {
    const path = getAncestorPath('subtask-1', sampleNodes as NodeItem[]);
    expect(path).toHaveLength(5);
    expect(path[0].title).toBe('Production');
    expect(path[1].title).toBe('SS26');
    expect(path[2].title).toBe('Model X');
    expect(path[3].title).toBe('Start Production');
    expect(path[4].title).toBe('Material A');
  });

  it('should find sibling nodes at same depth level', () => {
    const { prevNode, nextNode } = getSiblingNodes('task-1', sampleNodes as NodeItem[]);
    expect(prevNode).toBeNull();
    expect(nextNode?.title).toBe('QC Inspection');
  });
});
