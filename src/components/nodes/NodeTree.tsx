import React, { useState, useMemo } from 'react';
import { useNodes } from '../../context/NodeContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useDialog } from '../../context/DialogContext';
import { TreeNode } from '../../types/domain';
import { NodeRow } from './NodeRow';
import { NodeForm } from './NodeForm';
import { MoveConflictModal } from './MoveConflictModal';
import { MovePreview } from '../../context/NodeContext';
import { matchesSearchQuery } from '../../utils/search';
import { Plus, FolderPlus, Layers, Search, Filter, AlertCircle, Sparkles, CheckSquare, Square, X, Trash2, CheckCircle2, Circle, Maximize2, Minimize2 } from 'lucide-react';

interface NodeTreeProps {
  onSelectNode: (node: TreeNode) => void;
}

export const NodeTree: React.FC<NodeTreeProps> = ({ onSelectNode }) => {
  const { getTree, nodes, updateStatus, deleteNode, hideNodeLocally, restoreNodesLocally, cleanupGoogleEventsFor, getDescendantNodes, previewMove, commitMove } = useNodes();
  const { isIndividual } = useAuth();
  const toast = useToast();
  const { confirm } = useDialog();
  const rawTree = getTree();

  const [showAddRoot, setShowAddRoot] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [criticalOnly, setCriticalOnly] = useState(false);

  // Bulk selection / bulk actions
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Hierarchy expand/collapse state (shared across the whole tree, threaded down through NodeRow)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const handleToggleExpand = (nodeId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const handleExpandAll = () => {
    const idsWithChildren = new Set<string>();
    const collect = (list: TreeNode[]) => {
      for (const n of list) {
        if (n.children && n.children.length > 0) {
          idsWithChildren.add(n.id);
          collect(n.children);
        }
      }
    };
    collect(rawTree);
    setExpandedIds(idsWithChildren);
  };

  const handleCollapseAll = () => {
    setExpandedIds(new Set());
  };

  const handleExpandSubtree = (nodeId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.add(nodeId);
      for (const descendant of getDescendantNodes(nodeId)) {
        if (nodes.some(n => n.parent_id === descendant.id)) {
          next.add(descendant.id);
        }
      }
      return next;
    });
  };

  // Drag-and-drop reposition: drag any non-root task onto another task within
  // the same Level 1 tree to reparent it there (and, since level is derived
  // from tree position, its hierarchy level updates along with it).
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [movePreview, setMovePreview] = useState<MovePreview | null>(null);

  const handleDragStartNode = (nodeId: string) => setDraggingId(nodeId);
  const handleDragOverNode = (nodeId: string) => setDragOverId(nodeId);
  const handleDragEndNode = () => {
    setDraggingId(null);
    setDragOverId(null);
  };

  const handleDropOnNode = (targetId: string) => {
    const sourceId = draggingId;
    setDraggingId(null);
    setDragOverId(null);
    if (!sourceId || sourceId === targetId) return;

    const result = previewMove(sourceId, targetId);
    if ('conflicts' in result) {
      setMovePreview(result);
    } else {
      toast.error(result.message);
    }
  };

  const handleConfirmMove = async (dateOverrides: Record<string, string>) => {
    if (!movePreview) return;
    await commitMove(movePreview.nodeId, movePreview.newParentId, dateOverrides);
    toast.success(`Moved "${movePreview.nodeTitle}" under "${movePreview.newParentTitle}".`);
    setMovePreview(null);
  };

  const toggleSelectMode = () => {
    setSelectMode(prev => !prev);
    setSelectedIds(new Set());
  };

  const handleToggleSelect = (nodeId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkStatus = async (status: 'not_started' | 'in_progress' | 'done' | 'blocked') => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    await Promise.all(ids.map(id => updateStatus(id, status)));
    toast.success(`Updated status for ${ids.length} item${ids.length === 1 ? '' : 's'}.`);
    clearSelection();
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const ok = await confirm({
      title: 'Delete Selected Milestones',
      message: `Delete ${ids.length} selected item${ids.length === 1 ? '' : 's'}? Any of their subtasks will also be removed.`,
      destructive: true,
      confirmLabel: 'Delete Selected',
    });
    if (!ok) return;

    const allRemoved = ids.flatMap(id => hideNodeLocally(id));
    toast.undoable({
      message: `${ids.length} item${ids.length === 1 ? '' : 's'} deleted.`,
      onCommit: () => { cleanupGoogleEventsFor(allRemoved); ids.forEach(id => deleteNode(id)); },
      onUndo: () => restoreNodesLocally(allRemoved),
    });
    clearSelection();
  };

  // Deep multi-field search & filtering
  const filteredTree = useMemo(() => {
    const filterNode = (node: TreeNode): TreeNode | null => {
      const matchesSearch = matchesSearchQuery(node, searchQuery, nodes);
      const matchesStatus = statusFilter === 'all' || node.status === statusFilter;
      const matchesCritical = !criticalOnly || node.is_critical;

      const filteredChildren: TreeNode[] = [];
      if (node.children) {
        for (const child of node.children) {
          const res = filterNode(child);
          if (res) filteredChildren.push(res);
        }
      }

      const nodeSelfMatches = matchesSearch && matchesStatus && matchesCritical;

      if (nodeSelfMatches || filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren,
        };
      }

      return null;
    };

    const results: TreeNode[] = [];
    for (const rootNode of rawTree) {
      const res = filterNode(rootNode);
      if (res) results.push(res);
    }

    return results;
  }, [rawTree, searchQuery, statusFilter, criticalOnly, nodes]);

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-[var(--card-bg)] p-4 rounded-2xl border border-[var(--border)] shadow-2xs gap-3">
        <div>
          <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Layers className="w-5 h-5 text-[var(--accent)]" />
            {isIndividual ? 'My Personal Tasks & Milestones' : 'Milestone Hierarchy (Time & Action Tree)'}
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            {isIndividual 
              ? 'Organize your personal busy schedule, projects, subtasks, and relative target dates.' 
              : 'Infinitely nestable projects, tasks, and relative milestones. Collapsed by default.'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExpandAll}
            title="Expand entire hierarchy"
            className="px-3 py-2 text-xs font-bold rounded-xl border shadow-xs transition-colors flex items-center gap-1.5 bg-[var(--card-bg)] text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--canvas-bg)]"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Expand All</span>
          </button>

          <button
            type="button"
            onClick={handleCollapseAll}
            title="Collapse entire hierarchy"
            className="px-3 py-2 text-xs font-bold rounded-xl border shadow-xs transition-colors flex items-center gap-1.5 bg-[var(--card-bg)] text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--canvas-bg)]"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Collapse All</span>
          </button>

          <button
            type="button"
            onClick={toggleSelectMode}
            className={`px-3 py-2 text-xs font-bold rounded-xl border shadow-xs transition-colors flex items-center gap-1.5 ${
              selectMode
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : 'bg-[var(--card-bg)] text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--canvas-bg)]'
            }`}
          >
            {selectMode ? <X className="w-3.5 h-3.5" /> : <CheckSquare className="w-3.5 h-3.5" />}
            <span>{selectMode ? 'Cancel' : 'Select'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddRoot(true)}
            className="px-3.5 py-2 text-xs font-bold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>{isIndividual ? 'Add New Task / Project' : 'Add Project / Department'}</span>
          </button>
        </div>
      </div>

      {/* Deep Search & Filter Bar */}
      <div className="bg-[var(--card-bg)] p-3 rounded-2xl border border-[var(--border)] shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search tasks, milestones, notes, dates..."
            className="w-full pl-8 pr-3 py-1.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl outline-none focus:border-[var(--input-focus-border)] focus:bg-[var(--card-bg)]"
          />
          <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-2.5" />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl outline-none focus:border-[var(--input-focus-border)] font-semibold"
            >
              <option value="all">All Statuses</option>
              <option value="not_started">Not Started</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => setCriticalOnly(!criticalOnly)}
            className={`px-3 py-1.5 rounded-xl border font-semibold flex items-center gap-1 transition-colors ${
              criticalOnly
                ? 'bg-amber-100 text-amber-900 border-amber-300'
                : 'bg-[var(--badge-bg)] text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--border-subtle)]'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            <span>Critical Only</span>
          </button>
        </div>
      </div>

      {/* Tree container */}
      {rawTree.length === 0 ? (
        <div className="bg-[var(--card-bg)] rounded-3xl p-12 text-center border border-[var(--border)] shadow-2xs space-y-4 max-w-lg mx-auto my-8">
          <div className="w-14 h-14 rounded-2xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center mx-auto border border-[var(--accent)]/20">
            <FolderPlus className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--text-primary)]">Your Workspace is Ready!</h3>
            <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto mt-1">
              Create your first project or milestone to start planning tasks with relative date cascading.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddRoot(true)}
            className="px-5 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold text-xs rounded-xl shadow-md transition-all inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Create First Milestone</span>
          </button>
        </div>
      ) : filteredTree.length === 0 ? (
        <div className="bg-[var(--card-bg)] rounded-2xl p-12 text-center border border-[var(--border)] shadow-2xs">
          <FolderPlus className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">No matching milestones found</h3>
          <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto mt-1 mb-4">
            Try adjusting your search query or status filters.
          </p>
        </div>
      ) : (
        <div className="space-y-1 pb-16">
          {filteredTree.map(node => (
            <NodeRow
              key={node.id}
              node={node}
              onSelectNode={onSelectNode}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
              expandedIds={expandedIds}
              onToggleExpand={handleToggleExpand}
              onExpandSubtree={handleExpandSubtree}
              draggingId={draggingId}
              dragOverId={dragOverId}
              onDragStartNode={handleDragStartNode}
              onDragOverNode={handleDragOverNode}
              onDragEndNode={handleDragEndNode}
              onDropOnNode={handleDropOnNode}
            />
          ))}
        </div>
      )}

      {/* Floating Bulk Action Bar */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 bg-[var(--sidebar-bg)] text-[var(--sidebar-text)] rounded-2xl shadow-2xl border border-[var(--sidebar-border)] px-4 py-2.5 flex items-center gap-3">
          <span className="text-xs font-bold whitespace-nowrap">{selectedIds.size} selected</span>
          <div className="w-px h-5 bg-[var(--sidebar-border)]" />
          <button
            type="button"
            onClick={() => handleBulkStatus('done')}
            title="Mark Done"
            className="p-1.5 rounded-lg hover:bg-[var(--sidebar-hover)] flex items-center gap-1 text-xs font-semibold"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Done</span>
          </button>
          <button
            type="button"
            onClick={() => handleBulkStatus('in_progress')}
            title="Mark In Progress"
            className="p-1.5 rounded-lg hover:bg-[var(--sidebar-hover)] flex items-center gap-1 text-xs font-semibold"
          >
            <Circle className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">In Progress</span>
          </button>
          <button
            type="button"
            onClick={handleBulkDelete}
            title="Delete Selected"
            className="p-1.5 rounded-lg hover:bg-rose-500/20 flex items-center gap-1 text-xs font-semibold text-rose-300"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Delete</span>
          </button>
          <div className="w-px h-5 bg-[var(--sidebar-border)]" />
          <button
            type="button"
            onClick={clearSelection}
            title="Clear Selection"
            className="p-1.5 rounded-lg hover:bg-[var(--sidebar-hover)]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {showAddRoot && (
        <NodeForm
          parentId={null}
          onClose={() => setShowAddRoot(false)}
        />
      )}

      {movePreview && (
        <MoveConflictModal
          preview={movePreview}
          onConfirm={handleConfirmMove}
          onCancel={() => setMovePreview(null)}
        />
      )}
    </div>
  );
};
