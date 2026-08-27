import React, { useState } from 'react';
import { useNodes } from '../../context/NodeContext';
import { useToast } from '../../context/ToastContext';
import { exportToExcel } from '../../utils/excel-export';
import { 
  X, Download, FileSpreadsheet, Layers, CheckCircle2, 
  FileText, Check 
} from 'lucide-react';

interface ExportModalProps {
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ onClose }) => {
  const { nodes, reminders } = useNodes();
  const toast = useToast();

  const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [includeCompleted, setIncludeCompleted] = useState(true);
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [includeActionFeed, setIncludeActionFeed] = useState(true);
  const [includeAlerts, setIncludeAlerts] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  const departments = Array.from(new Set(nodes.map(n => n.department).filter(Boolean))) as string[];

  const handleExport = () => {
    setIsExporting(true);
    setExportSuccess(false);

    setTimeout(() => {
      try {
        exportToExcel(nodes, reminders, {
          format,
          includeCompleted,
          departmentFilter: departmentFilter === 'all' ? null : departmentFilter,
          includeActionFeedSheet: includeActionFeed,
          includeAlertsSheet: includeAlerts,
        });

        setExportSuccess(true);
        setTimeout(() => {
          onClose();
        }, 1500);
      } catch (err) {
        console.error('Export error:', err);
        toast.error('Error exporting the file. Please try again.');
      } finally {
        setIsExporting(false);
      }
    }, 400);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-[var(--card-bg)] rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-[var(--border)] text-xs flex flex-col">
        
        {/* Header — uses the app's accent, not a fixed brand color, so it reads
            consistently whichever of the 3 app themes is active */}
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ background: `linear-gradient(135deg, var(--header-gradient-from), var(--header-gradient-to))`, color: 'var(--sidebar-text)' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[var(--accent)]/20 text-[var(--accent-secondary)] flex items-center justify-center border border-[var(--accent)]/30 shrink-0">
              <FileSpreadsheet className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold tracking-tight">Export CPM Schedule</h2>
              <p className="text-[11px] opacity-80 mt-0.5">Download full milestone hierarchy, dates & notes</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg opacity-80 hover:opacity-100 hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Options Body */}
        <div className="p-6 space-y-4 font-sans">
          
          {/* File Format Selector */}
          <div>
            <label className="block font-bold text-[var(--text-primary)] mb-1.5">Export File Format</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormat('xlsx')}
                className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-between transition-all ${
                  format === 'xlsx'
                    ? 'bg-[var(--accent-subtle)] text-[var(--text-primary)] border-[var(--accent)] ring-2 ring-[var(--accent)]/20'
                    : 'bg-[var(--input-bg)] text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--badge-bg)]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-[var(--accent)]" />
                  <span>Excel (.xlsx)</span>
                </div>
                {format === 'xlsx' && <Check className="w-4 h-4 text-[var(--accent)] stroke-[3]" />}
              </button>

              <button
                type="button"
                onClick={() => setFormat('csv')}
                className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-between transition-all ${
                  format === 'csv'
                    ? 'bg-[var(--accent-subtle)] text-[var(--text-primary)] border-[var(--accent)] ring-2 ring-[var(--accent)]/20'
                    : 'bg-[var(--input-bg)] text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--badge-bg)]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[var(--accent)]" />
                  <span>CSV File (.csv)</span>
                </div>
                {format === 'csv' && <Check className="w-4 h-4 text-[var(--accent)] stroke-[3]" />}
              </button>
            </div>
          </div>

          {/* Department Filter */}
          <div>
            <label className="block font-bold text-[var(--text-primary)] mb-1.5 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-[var(--text-muted)]" /> Department Scope
            </label>
            <select
              value={departmentFilter}
              onChange={e => setDepartmentFilter(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-[var(--input-bg)] border border-[var(--border)] rounded-xl font-semibold outline-none focus:border-[var(--accent)] text-[var(--text-primary)]"
            >
              <option value="all">✨ All Departments & Streams ({nodes.length} total tasks)</option>
              {departments.map(dept => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          {/* Included Content Options */}
          <div className="space-y-2 pt-1 border-t border-[var(--border-subtle)]">
            <label className="block font-bold text-[var(--text-primary)] mb-1">Included Workbook Data</label>
            
            <label className="flex items-center gap-2.5 text-xs text-[var(--text-secondary)] font-medium cursor-pointer p-2 bg-[var(--input-bg)] rounded-xl border border-[var(--border)]">
              <input
                type="checkbox"
                checked={includeCompleted}
                onChange={e => setIncludeCompleted(e.target.checked)}
                className="w-4 h-4 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)] cursor-pointer"
              />
              <span className="font-semibold text-[var(--text-primary)]">Include Completed Tasks & Milestones</span>
            </label>

            {format === 'xlsx' && (
              <>
                <label className="flex items-center gap-2.5 text-xs text-[var(--text-secondary)] font-medium cursor-pointer p-2 bg-[var(--input-bg)] rounded-xl border border-[var(--border)]">
                  <input
                    type="checkbox"
                    checked={includeActionFeed}
                    onChange={e => setIncludeActionFeed(e.target.checked)}
                    className="w-4 h-4 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)] cursor-pointer"
                  />
                  <span className="font-semibold text-[var(--text-primary)]">Include "Action Feed" Sheet (Overdue & Due Today)</span>
                </label>

                <label className="flex items-center gap-2.5 text-xs text-[var(--text-secondary)] font-medium cursor-pointer p-2 bg-[var(--input-bg)] rounded-xl border border-[var(--border)]">
                  <input
                    type="checkbox"
                    checked={includeAlerts}
                    onChange={e => setIncludeAlerts(e.target.checked)}
                    className="w-4 h-4 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)] cursor-pointer"
                  />
                  <span className="font-semibold text-[var(--text-primary)]">Include "Alerts & Reminders" Sheet</span>
                </label>
              </>
            )}
          </div>

          {/* Success Banner */}
          {exportSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl text-emerald-950 font-bold text-xs flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>✓ File generated and downloaded successfully!</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-[var(--text-secondary)] font-semibold rounded-xl hover:bg-[var(--badge-bg)] transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting}
              className="h-10 px-5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-extrabold rounded-xl shadow-md transition-all flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>{isExporting ? 'Generating File...' : 'Download File'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
