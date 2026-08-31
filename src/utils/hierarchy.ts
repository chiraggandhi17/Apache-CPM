import { NodeItem, NodeType } from '../types/domain';

export interface AncestorStep {
  id: string;
  title: string;
  type: NodeType;
  color: string | null;
}

/**
 * Returns full path array of ancestor nodes from Root -> Target Node
 */
export function getAncestorPath(nodeId: string | null, allNodes: NodeItem[]): AncestorStep[] {
  if (!nodeId) return [];

  const path: AncestorStep[] = [];
  let current = allNodes.find(n => n.id === nodeId);

  while (current) {
    path.unshift({
      id: current.id,
      title: current.title,
      type: current.type,
      color: current.color,
    });

    if (!current.parent_id) break;
    current = allNodes.find(n => n.id === current!.parent_id);
  }

  return path;
}

/**
 * Returns previous and next sibling nodes at the same parent depth level
 */
export function getSiblingNodes(nodeId: string, allNodes: NodeItem[]): { prevNode: NodeItem | null; nextNode: NodeItem | null } {
  const current = allNodes.find(n => n.id === nodeId);
  if (!current) return { prevNode: null, nextNode: null };

  const siblings = allNodes.filter(n => n.parent_id === current.parent_id);
  siblings.sort((a, b) => a.sort_order - b.sort_order);

  const idx = siblings.findIndex(n => n.id === nodeId);
  if (idx === -1) return { prevNode: null, nextNode: null };

  const prevNode = idx > 0 ? siblings[idx - 1] : null;
  const nextNode = idx < siblings.length - 1 ? siblings[idx + 1] : null;

  return { prevNode, nextNode };
}

/**
 * Resolves a node's hierarchy level (1-5) based on its type, falling back to
 * structural parent-chain depth for any unmatched/legacy type. This is the
 * single source of truth for "level" so that level badges (NodeRow) and the
 * calendar's level filters/badges (CalendarView) never diverge when a node's
 * type is edited independently of its parent_id.
 */
export function getNodeLevel(node: NodeItem, allNodes: NodeItem[]): number {
  if (node.type === 'department') return 1;
  if (node.type === 'season') return 2;
  if (node.type === 'project') return 3;
  if (node.type === 'task') return 4;
  if (node.type === 'subtask') return 5;

  let depth = 1;
  let curr: NodeItem | undefined = node;
  while (curr && curr.parent_id) {
    depth++;
    curr = allNodes.find(n => n.id === curr!.parent_id);
  }
  return Math.min(5, depth);
}

/**
 * Returns the type a new child would take under a parent of the given type,
 * following the fixed Department -> Season -> Project -> Task -> Subtask
 * progression. Task/Subtask (and anything nested under a Subtask) all
 * terminate at 'subtask' since there is no Level 6.
 */
export function getChildType(parentType: NodeType): NodeType {
  if (parentType === 'department') return 'season';
  if (parentType === 'season') return 'project';
  if (parentType === 'project') return 'task';
  return 'subtask';
}

/**
 * Walks a node's parent_id chain to the top and returns the id of its
 * Level 1 (root/department) ancestor — or the node's own id if it has no
 * parent. Used to keep drag-and-drop reparenting confined to the same
 * Level 1 tree.
 */
export function getRootAncestorId(nodeId: string, allNodes: NodeItem[]): string | null {
  let current = allNodes.find(n => n.id === nodeId);
  if (!current) return null;
  while (current.parent_id) {
    const parent = allNodes.find(n => n.id === current!.parent_id);
    if (!parent) break;
    current = parent;
  }
  return current.id;
}
