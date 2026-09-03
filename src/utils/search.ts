import { NodeItem, TreeNode } from '../types/domain';
import { formatLocalDate } from './date-format';
import { locationModeLabel } from './location-mode';

/**
 * Deep multi-field search predicate:
 * Matches title, subtasks, vendor_contact, assignee, description, date strings, and month names (e.g. "October", "Nov").
 */
export function matchesSearchQuery(node: NodeItem | TreeNode, query: string, allNodes: NodeItem[] = []): boolean {
  if (!query || !query.trim()) return true;

  const q = query.toLowerCase().trim();

  // 1. Direct Field Checks
  if (node.title && node.title.toLowerCase().includes(q)) return true;
  if (node.assignee && node.assignee.toLowerCase().includes(q)) return true;
  if (node.vendor_contact && node.vendor_contact.toLowerCase().includes(q)) return true;
  const locLabel = locationModeLabel(node.location_mode);
  if (locLabel && locLabel.toLowerCase().includes(q)) return true;
  if (node.description && node.description.toLowerCase().includes(q)) return true;
  if (node.department && node.department.toLowerCase().includes(q)) return true;
  if (node.season && node.season.toLowerCase().includes(q)) return true;

  // 2. Date & Month Name Checks
  if (node.planned_date) {
    const formattedDate = formatLocalDate(node.planned_date, 'MMMM MMM d yyyy').toLowerCase();
    if (formattedDate.includes(q)) return true;
  }

  // 3. Recursive Child Subtask Check
  // If TreeNode, check children
  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      if (matchesSearchQuery(child, query, allNodes)) return true;
    }
  } else if (allNodes.length > 0) {
    // Check flat children array in allNodes
    const children = allNodes.filter(n => n.parent_id === node.id);
    for (const child of children) {
      if (matchesSearchQuery(child, query, allNodes)) return true;
    }
  }

  return false;
}
