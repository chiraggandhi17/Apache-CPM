import React, { useState, useMemo, useRef } from 'react';
import { NodeItem } from '../../types/domain';
import { Search, X, Check, ChevronDown, Layers } from 'lucide-react';
import { PortalDropdown } from './PortalDropdown';

interface SearchableParentSelectProps {
  nodes: NodeItem[];
  selectedParentId: string | null;
  onSelectParent: (parentId: string | null) => void;
  placeholder?: string;
}

export const SearchableParentSelect: React.FC<SearchableParentSelectProps> = ({
  nodes,
  selectedParentId,
  onSelectParent,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Compute Level 1 Department / Stream Options & Subtask Counts
  const { parentOptions, selectedParentNode, subtaskCounts } = useMemo(() => {
    // Only Level 1 Department / Stream nodes
    const parents = nodes.filter(n => n.type === 'department' || !n.parent_id);

    // Calculate count of child sub-items for each Level 1 Department
    const counts: Record<string, number> = {};
    parents.forEach(p => {
      let count = 0;
      const queue = [p.id];
      const visited = new Set([p.id]);
      while (queue.length > 0) {
        const currId = queue.shift()!;
        const children = nodes.filter(n => n.parent_id === currId);
        for (const child of children) {
          if (!visited.has(child.id)) {
            visited.add(child.id);
            count++;
            queue.push(child.id);
          }
        }
      }
      counts[p.id] = count;
    });

    const selNode = selectedParentId ? nodes.find(n => n.id === selectedParentId) || null : null;
    return { parentOptions: parents, selectedParentNode: selNode, subtaskCounts: counts };
  }, [nodes, selectedParentId]);

  // Filtered Options by Search Query
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return parentOptions;
    const q = searchQuery.toLowerCase();
    return parentOptions.filter(p => 
      p.title.toLowerCase().includes(q) || 
      (p.department && p.department.toLowerCase().includes(q))
    );
  }, [parentOptions, searchQuery]);

  return (
    <>
      {/* Trigger Button — matches height/padding of sibling filter buttons */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(o => !o)}
        className={`h-9 px-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 transition-all ${
          selectedParentNode
            ? 'bg-indigo-50 text-indigo-950 border-indigo-300 ring-1 ring-indigo-300/50'
            : 'bg-[var(--card-bg)] text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--badge-bg)]'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Layers className={`w-3.5 h-3.5 shrink-0 ${selectedParentNode ? 'text-indigo-600' : 'text-[var(--text-muted)]'}`} />
          <span className="truncate max-w-[140px] sm:max-w-[200px]">
            {selectedParentNode ? selectedParentNode.title : 'All Departments'}
          </span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''} ${selectedParentNode ? 'text-indigo-400' : 'text-[var(--text-muted)]'}`} />
      </button>

      {/* Searchable Dropdown Popup — portaled so it always renders above the sidebar
          and is never clipped by the scrollable <main> content area */}
      <PortalDropdown open={isOpen} anchorRef={triggerRef} onClose={() => setIsOpen(false)} align="left" width={340}>
        <div className="bg-[var(--card-bg)] rounded-2xl shadow-xl border border-[var(--border)] overflow-hidden">

          {/* Live Search Header Input */}
          <div className="p-2.5 border-b border-[var(--border-subtle)] bg-[var(--badge-bg)] flex items-center gap-2">
            <Search className="w-4 h-4 text-[var(--text-muted)] shrink-0 ml-1" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search department or stream..."
              className="w-full text-xs bg-transparent outline-none font-medium text-[var(--text-primary)] placeholder-[var(--text-muted)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-md"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Options List */}
          <div className="max-h-64 overflow-y-auto p-1.5 space-y-0.5 text-xs">
            {/* Default Option: All Departments & Streams */}
            <button
              type="button"
              onClick={() => {
                onSelectParent(null);
                setIsOpen(false);
              }}
              className={`w-full p-2 rounded-xl flex items-center justify-between text-left transition-colors ${
                !selectedParentId ? 'bg-indigo-50 text-indigo-950 font-extrabold' : 'hover:bg-[var(--badge-bg)] text-[var(--text-secondary)] font-semibold'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-md bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-[10px]">
                  ✨
                </span>
                <span>All Departments & Streams</span>
              </div>
              {!selectedParentId && <Check className="w-4 h-4 text-indigo-600 stroke-[3]" />}
            </button>

            {filteredOptions.length === 0 ? (
              <div className="p-4 text-center text-[var(--text-muted)] italic">
                No matching departments found
              </div>
            ) : (
              filteredOptions.map(p => {
                const isSelected = selectedParentId === p.id;
                const childCount = subtaskCounts[p.id] || 0;

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onSelectParent(p.id);
                      setIsOpen(false);
                    }}
                    className={`w-full p-2.5 rounded-xl flex items-center justify-between text-left transition-colors ${
                      isSelected ? 'bg-indigo-50 text-indigo-950 font-bold border border-indigo-200' : 'hover:bg-[var(--badge-bg)] text-[var(--text-primary)]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <Layers className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <div className="min-w-0">
                        <span className="block font-bold truncate text-[var(--text-primary)]">{p.title}</span>
                        <span className="text-[10px] text-[var(--text-muted)] font-mono block uppercase">
                          Level 1 Department
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] bg-[var(--badge-bg)] font-bold font-mono px-2 py-0.5 rounded-md text-[var(--text-secondary)]">
                        {childCount} tasks
                      </span>
                      {isSelected && <Check className="w-4 h-4 text-indigo-600 stroke-[3]" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </PortalDropdown>
    </>
  );
};
