import React, { useState, useMemo } from 'react';
import { useNodes } from '../../context/NodeContext';
import { useAuth } from '../../context/AuthContext';
import { TreeNode } from '../../types/domain';
import { NodeRow } from './NodeRow';
import { NodeForm } from './NodeForm';
import { matchesSearchQuery } from '../../utils/search';
import { Plus, FolderPlus, Layers, Search, Filter, AlertCircle, Sparkles } from 'lucide-react';

interface NodeTreeProps {
  onSelectNode: (node: TreeNode) => void;
}

export const NodeTree: React.FC<NodeTreeProps> = ({ onSelectNode }) => {
  const { getTree, nodes } = useNodes();
  const { isIndividual } = useAuth();
  const rawTree = getTree();

  const [showAddRoot, setShowAddRoot] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [criticalOnly, setCriticalOnly] = useState(false);

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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-white p-4 rounded-2xl border border-gray-200/80 shadow-2xs gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Layers className="w-5 h-5 text-teal-600" />
            {isIndividual ? 'My Personal Tasks & Milestones' : 'Milestone Hierarchy (Time & Action Tree)'}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {isIndividual 
              ? 'Organize your personal busy schedule, projects, subtasks, and relative target dates.' 
              : 'Infinitely nestable projects, tasks, and relative milestones. Collapsed by default.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddRoot(true)}
          className="px-3.5 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{isIndividual ? 'Add New Task / Project' : 'Add Project / Department'}</span>
        </button>
      </div>

      {/* Deep Search & Filter Bar */}
      <div className="bg-white p-3 rounded-2xl border border-gray-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search tasks, milestones, notes, dates..."
            className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-teal-500 focus:bg-white"
          />
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-teal-500 font-semibold"
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
                : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            <span>Critical Only</span>
          </button>
        </div>
      </div>

      {/* Tree container */}
      {rawTree.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-gray-200 shadow-2xs space-y-4 max-w-lg mx-auto my-8">
          <div className="w-14 h-14 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto border border-teal-200">
            <FolderPlus className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">Your Workspace is Ready!</h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1">
              Create your first project or milestone to start planning tasks with relative date cascading.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddRoot(true)}
            className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-md transition-all inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Create First Milestone</span>
          </button>
        </div>
      ) : filteredTree.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-gray-200 shadow-2xs">
          <FolderPlus className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-gray-800">No matching milestones found</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1 mb-4">
            Try adjusting your search query or status filters.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {filteredTree.map(node => (
            <NodeRow key={node.id} node={node} onSelectNode={onSelectNode} />
          ))}
        </div>
      )}

      {showAddRoot && (
        <NodeForm
          parentId={null}
          onClose={() => setShowAddRoot(false)}
        />
      )}
    </div>
  );
};
