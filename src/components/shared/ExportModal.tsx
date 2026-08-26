import React, { useState } from 'react';
import { useNodes } from '../../context/NodeContext';
import { exportToExcel } from '../../utils/excel-export';
import { 
  X, Download, FileSpreadsheet, Layers, CheckCircle2, 
  Bell, FileText, Sparkles, Check 
} from 'lucide-react';

interface ExportModalProps {
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ onClose }) => {
  const { nodes, reminders } = useNodes();

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
        alert('Error exporting Excel file. Please try again.');
      } finally {
        setIsExporting(false);
      }
    }, 400);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200 text-xs flex flex-col">
        
        {/* Header */}
        <div className="px-6 py-4 bg-emerald-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center border border-emerald-500/30 shrink-0">
              <FileSpreadsheet className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold tracking-tight">Export CPM Schedule to Excel</h2>
              <p className="text-[11px] text-emerald-200/90 mt-0.5">Download full milestone hierarchy, dates & notes</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-emerald-300 hover:text-white hover:bg-emerald-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Options Body */}
        <div className="p-6 space-y-4 font-sans">
          
          {/* File Format Selector */}
          <div>
            <label className="block font-bold text-gray-800 mb-1.5">Export File Format</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormat('xlsx')}
                className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-between transition-all ${
                  format === 'xlsx'
                    ? 'bg-emerald-50 text-emerald-950 border-emerald-400 ring-2 ring-emerald-500/20'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Excel (.xlsx)</span>
                </div>
                {format === 'xlsx' && <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />}
              </button>

              <button
                type="button"
                onClick={() => setFormat('csv')}
                className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-between transition-all ${
                  format === 'csv'
                    ? 'bg-emerald-50 text-emerald-950 border-emerald-400 ring-2 ring-emerald-500/20'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-teal-600" />
                  <span>CSV File (.csv)</span>
                </div>
                {format === 'csv' && <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />}
              </button>
            </div>
          </div>

          {/* Department Filter */}
          <div>
            <label className="block font-bold text-gray-800 mb-1.5 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-gray-400" /> Department Scope
            </label>
            <select
              value={departmentFilter}
              onChange={e => setDepartmentFilter(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl font-semibold outline-none focus:border-emerald-500"
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
          <div className="space-y-2 pt-1 border-t border-gray-100">
            <label className="block font-bold text-gray-800 mb-1">Included Workbook Data</label>
            
            <label className="flex items-center gap-2.5 text-xs text-gray-700 font-medium cursor-pointer p-2 bg-gray-50 rounded-xl border border-gray-200">
              <input
                type="checkbox"
                checked={includeCompleted}
                onChange={e => setIncludeCompleted(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <span className="font-semibold text-gray-900">Include Completed Tasks & Milestones</span>
            </label>

            {format === 'xlsx' && (
              <>
                <label className="flex items-center gap-2.5 text-xs text-gray-700 font-medium cursor-pointer p-2 bg-gray-50 rounded-xl border border-gray-200">
                  <input
                    type="checkbox"
                    checked={includeActionFeed}
                    onChange={e => setIncludeActionFeed(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span className="font-semibold text-gray-900">Include "Action Feed" Sheet (Overdue & Due Today)</span>
                </label>

                <label className="flex items-center gap-2.5 text-xs text-gray-700 font-medium cursor-pointer p-2 bg-gray-50 rounded-xl border border-gray-200">
                  <input
                    type="checkbox"
                    checked={includeAlerts}
                    onChange={e => setIncludeAlerts(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span className="font-semibold text-gray-900">Include "Alerts & Reminders" Sheet</span>
                </label>
              </>
            )}
          </div>

          {/* Success Banner */}
          {exportSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl text-emerald-950 font-bold text-xs flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>✓ Excel file generated and downloaded successfully!</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-gray-600 font-semibold rounded-xl hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting}
              className="h-10 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-md shadow-emerald-600/20 transition-all flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>{isExporting ? 'Generating Excel...' : 'Download Excel File'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
