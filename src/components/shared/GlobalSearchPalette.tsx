import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNodes } from '../../context/NodeContext';
import { NodeItem, NodeType } from '../../types/domain';
import { formatLocalDate } from '../../utils/date-format';
import { locationModeLabel } from '../../utils/location-mode';
import {
  Search, Building2, FolderKanban, Box, Zap, CornerDownRight, Bell,
  CornerDownLeft, ArrowUp, ArrowDown, X,
} from 'lucide-react';

const getNodeIcon = (type: NodeType): React.ReactNode => {
  switch (type) {
    case 'department': return <Building2 className="w-3.5 h-3.5" />;
    case 'season': return <FolderKanban className="w-3.5 h-3.5" />;
    case 'project': return <Box className="w-3.5 h-3.5" />;
    case 'task': return <Zap className="w-3.5 h-3.5" />;
    case 'subtask': return <CornerDownRight className="w-3.5 h-3.5" />;
    case 'reminder': return <Bell className="w-3.5 h-3.5" />;
    default: return <Zap className="w-3.5 h-3.5" />;
  }
};

interface ScoredResult {
  node: NodeItem;
  score: number;
  matchField: string;
}

function scoreNode(node: NodeItem, q: string): ScoredResult | null {
  const query = q.toLowerCase().trim();
  if (!query) return null;

  const title = (node.title || '').toLowerCase();
  if (title === query) return { node, score: 100, matchField: 'title' };
  if (title.startsWith(query)) return { node, score: 80, matchField: 'title' };
  if (title.includes(query)) return { node, score: 60, matchField: 'title' };

  if (node.assignee && node.assignee.toLowerCase().includes(query)) {
    return { node, score: 40, matchField: `assignee: ${node.assignee}` };
  }
  if (node.vendor_contact && node.vendor_contact.toLowerCase().includes(query)) {
    return { node, score: 35, matchField: `vendor: ${node.vendor_contact}` };
  }
  const locLabel = locationModeLabel(node.location_mode);
  if (locLabel && locLabel.toLowerCase().includes(query)) {
    return { node, score: 30, matchField: `location: ${locLabel}` };
  }
  if (node.department && node.department.toLowerCase().includes(query)) {
    return { node, score: 30, matchField: `department: ${node.department}` };
  }
  if (node.season && node.season.toLowerCase().includes(query)) {
    return { node, score: 30, matchField: `season: ${node.season}` };
  }
  if (node.description && node.description.toLowerCase().includes(query)) {
    return { node, score: 20, matchField: 'description' };
  }
  if (node.planned_date) {
    const formatted = formatLocalDate(node.planned_date, 'MMMM MMM d yyyy').toLowerCase();
    if (formatted.includes(query)) {
      return { node, score: 15, matchField: formatLocalDate(node.planned_date, 'MMM d, yyyy') };
    }
  }

  return null;
}

interface GlobalSearchPaletteProps {
  open: boolean;
  onClose: () => void;
  onSelectNode: (node: NodeItem) => void;
}

export const GlobalSearchPalette: React.FC<GlobalSearchPaletteProps> = ({ open, onClose, onSelectNode }) => {
  const { nodes } = useNodes();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      // Focus after the portal paints
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const scored: ScoredResult[] = [];
    for (const node of nodes) {
      const r = scoreNode(node, query);
      if (r) scored.push(r);
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 20);
  }, [nodes, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  const handleSelect = (node: NodeItem) => {
    onSelectNode(node);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[activeIndex]) handleSelect(results[activeIndex].node);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.45)' }}
      onClick={() => onClose()}
    >
      <div
        className="w-full max-w-xl bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border)]">
          <Search className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tasks, projects, assignees, dates..."
            className="flex-1 bg-transparent outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
          <button
            type="button"
            onClick={() => onClose()}
            className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-md hover:bg-[var(--border-subtle)] shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {!query.trim() ? (
            <div className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">
              Start typing to search across every task, project, and milestone.
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">
              No results for "{query}".
            </div>
          ) : (
            <ul>
              {results.map((r, idx) => (
                <li key={r.node.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(r.node)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors ${
                      idx === activeIndex ? 'bg-[var(--accent-subtle)]' : 'hover:bg-[var(--canvas-bg)]'
                    }`}
                  >
                    <span
                      className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: `${r.node.color || 'var(--accent)'}18`,
                        color: r.node.color || 'var(--accent)',
                      }}
                    >
                      {getNodeIcon(r.node.type)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-[var(--text-primary)] truncate">
                        {r.node.title}
                      </span>
                      <span className="block text-[10px] text-[var(--text-muted)] truncate">
                        {r.matchField !== 'title' ? r.matchField : r.node.type}
                      </span>
                    </span>
                    {r.node.planned_date && (
                      <span className="text-[10px] font-mono text-[var(--text-secondary)] shrink-0">
                        {formatLocalDate(r.node.planned_date, 'MMM d')}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-3 px-4 py-2 border-t border-[var(--border)] text-[10px] text-[var(--text-muted)]">
          <span className="flex items-center gap-1"><ArrowUp className="w-3 h-3" /><ArrowDown className="w-3 h-3" /> Navigate</span>
          <span className="flex items-center gap-1"><CornerDownLeft className="w-3 h-3" /> Open</span>
          <span className="flex items-center gap-1">Esc Close</span>
        </div>
      </div>
    </div>,
    document.body
  );
};
