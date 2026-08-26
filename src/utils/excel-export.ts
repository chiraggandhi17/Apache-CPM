import * as XLSX from 'xlsx';
import { NodeItem, ReminderItem, TreeNode } from '../types/domain';
import { formatLocalDate } from './date-format';
import { getAncestorPath } from './hierarchy';

export interface ExportOptions {
  fileName?: string;
  format?: 'xlsx' | 'csv';
  includeCompleted?: boolean;
  departmentFilter?: string | null;
  includeAlertsSheet?: boolean;
  includeActionFeedSheet?: boolean;
}

export const exportToExcel = (
  nodes: NodeItem[],
  reminders: ReminderItem[],
  options: ExportOptions = {}
) => {
  const {
    fileName = `Cadence_CPM_Export_${new Date().toISOString().slice(0, 10)}.xlsx`,
    format = 'xlsx',
    includeCompleted = true,
    departmentFilter = null,
    includeAlertsSheet = true,
    includeActionFeedSheet = true,
  } = options;

  // Filter nodes based on user options
  let filteredNodes = nodes;
  if (!includeCompleted) {
    filteredNodes = filteredNodes.filter(n => n.status !== 'done');
  }
  if (departmentFilter) {
    filteredNodes = filteredNodes.filter(n => n.department === departmentFilter);
  }

  // Create Workbook
  const workbook = XLSX.utils.book_new();

  // SHEET 1: CPM TASK HIERARCHY & LINEAGE
  const hierarchyRows = filteredNodes.map(node => {
    const ancestorPath = getAncestorPath(node.id, nodes);
    const depth = ancestorPath.length;
    const indent = '  '.repeat(depth > 0 ? depth - 1 : 0);
    const prefix = depth > 1 ? '└─ ' : '';
    const lineageStr = ancestorPath.map(a => a.title).join(' > ');

    const levelLabels: Record<number, string> = {
      1: 'Level 1: Department / Stream',
      2: 'Level 2: Season / Collection',
      3: 'Level 3: Product Model / Project',
      4: 'Level 4: Milestone Task',
      5: 'Level 5: Subtask / Action Item',
    };

    return {
      'Level': levelLabels[depth] || `Level ${depth}`,
      'Lineage Path': lineageStr,
      'Milestone / Task Name': `${indent}${prefix}${node.title}`,
      'Type': node.type.toUpperCase(),
      'Department': node.department || 'N/A',
      'Season': node.season || 'N/A',
      'Planned Target Date': node.planned_date ? formatLocalDate(node.planned_date, 'yyyy-MM-dd') : 'No Date Set',
      'Actual Date': node.actual_date ? formatLocalDate(node.actual_date, 'yyyy-MM-dd') : 'N/A',
      'Status': node.status.toUpperCase().replace('_', ' '),
      'Critical Path?': node.is_critical ? 'YES (Critical)' : 'NO',
      'Assignee': node.assignee || 'Unassigned',
      'Vendor Contact': node.vendor_contact || 'N/A',
      'Offset Days': node.trigger_offset_days !== null ? node.trigger_offset_days : 'Absolute',
      'Notes & Specifications': node.description || '',
    };
  });

  const hierarchySheet = XLSX.utils.json_to_sheet(hierarchyRows);
  
  // Set column widths for clean readability
  hierarchySheet['!cols'] = [
    { wch: 24 }, // Level
    { wch: 35 }, // Lineage Path
    { wch: 40 }, // Task Name
    { wch: 15 }, // Type
    { wch: 18 }, // Department
    { wch: 12 }, // Season
    { wch: 18 }, // Planned Date
    { wch: 15 }, // Actual Date
    { wch: 15 }, // Status
    { wch: 16 }, // Critical Path
    { wch: 22 }, // Assignee
    { wch: 22 }, // Vendor Contact
    { wch: 14 }, // Offset Days
    { wch: 45 }, // Notes
  ];

  XLSX.utils.book_append_sheet(workbook, hierarchySheet, 'CPM Hierarchy');

  // SHEET 2: ACTION FEED (OVERDUE & UPCOMING)
  if (includeActionFeedSheet) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const actionRows = filteredNodes
      .filter(n => n.planned_date)
      .map(node => {
        const dateStr = node.planned_date!.slice(0, 10);
        const isOverdue = dateStr < todayStr && node.status !== 'done';
        const isToday = dateStr === todayStr && node.status !== 'done';

        return {
          'Urgent Category': isOverdue ? '⚠️ OVERDUE' : isToday ? '⭐ DUE TODAY' : '📅 UPCOMING',
          'Milestone Title': node.title,
          'Planned Target Date': formatLocalDate(node.planned_date!, 'yyyy-MM-dd'),
          'Department': node.department || 'N/A',
          'Status': node.status.toUpperCase().replace('_', ' '),
          'Assignee': node.assignee || 'Unassigned',
          'Critical?': node.is_critical ? 'CRITICAL' : 'Normal',
        };
      })
      .sort((a, b) => a['Planned Target Date'].localeCompare(b['Planned Target Date']));

    const actionSheet = XLSX.utils.json_to_sheet(actionRows);
    actionSheet['!cols'] = [
      { wch: 16 }, { wch: 35 }, { wch: 18 }, { wch: 18 }, { wch: 15 }, { wch: 20 }, { wch: 12 }
    ];
    XLSX.utils.book_append_sheet(workbook, actionSheet, 'Action Feed');
  }

  // SHEET 3: ACTIVE ALERTS & REMINDERS
  if (includeAlertsSheet) {
    const alertRows = reminders
      .filter(r => !r.dismissed_at)
      .map(rem => {
        const linkedNode = nodes.find(n => n.id === rem.node_id);
        return {
          'Alert Message': rem.message,
          'Trigger Date': formatLocalDate(rem.remind_at, 'yyyy-MM-dd'),
          'Linked Milestone': linkedNode?.title || 'N/A',
          'Department': linkedNode?.department || 'N/A',
          'Status': rem.snoozed_until ? 'SNOOZED' : 'ACTIVE',
          'Follow-up Log Note': rem.note || '',
        };
      });

    const alertSheet = XLSX.utils.json_to_sheet(alertRows);
    alertSheet['!cols'] = [
      { wch: 35 }, { wch: 16 }, { wch: 30 }, { wch: 18 }, { wch: 12 }, { wch: 40 }
    ];
    XLSX.utils.book_append_sheet(workbook, alertSheet, 'Alerts & Reminders');
  }

  // Write file output
  if (format === 'csv') {
    const csvContent = XLSX.utils.sheet_to_csv(hierarchySheet);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', fileName.replace('.xlsx', '.csv'));
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } else {
    XLSX.writeFile(workbook, fileName);
  }
};
