import React, { useState, useMemo, useRef, useEffect } from 'react';
import { NodeItem } from '../../types/domain';
import { FolderTree, Search, X, Check, ChevronDown, Layers, Calendar, Folder, CheckSquare } from 'lucide-react';

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
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    <div className="relative inline-block text-left" ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 transition-all shadow-2xs ${
          selectedParentNode
            ? 'bg-indigo-50 text-indigo-950 border-indigo-300 ring-2 ring-indigo-400/20'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Layers className="w-4 h-4 text-indigo-600 shrink-0" />
          <span className="truncate max-w-[160px] sm:max-w-[220px]">
            {selectedParentNode ? selectedParentNode.title : '✨ All Departments & Streams'}
          </span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Searchable Dropdown Popup */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-gray-200 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          
          {/* Live Search Header Input */}
          <div className="p-2.5 border-b border-gray-100 bg-gray-50/80 flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-400 shrink-0 ml-1" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search department or stream..."
              className="w-full text-xs bg-transparent outline-none font-medium placeholder-gray-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-md"
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
                !selectedParentId ? 'bg-indigo-50 text-indigo-950 font-extrabold' : 'hover:bg-gray-50 text-gray-700 font-semibold'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-md bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-[10px]">
                  ✨
                </span>
                <span>✨ All Departments & Streams</span>
              </div>
              {!selectedParentId && <Check className="w-4 h-4 text-indigo-600 stroke-[3]" />}
            </button>

            {filteredOptions.length === 0 ? (
              <div className="p-4 text-center text-gray-400 italic">
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
                      isSelected ? 'bg-indigo-50 text-indigo-950 font-bold border border-indigo-200' : 'hover:bg-gray-50 text-gray-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <Layers className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <div className="min-w-0">
                        <span className="block font-bold truncate text-gray-900">{p.title}</span>
                        <span className="text-[10px] text-gray-400 font-mono block uppercase">
                          Level 1 Department
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] bg-gray-100 font-bold font-mono px-2 py-0.5 rounded-md text-gray-600">
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
      )}
    </div>
  );
};
