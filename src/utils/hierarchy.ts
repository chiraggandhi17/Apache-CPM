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
