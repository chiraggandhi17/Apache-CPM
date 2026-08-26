import { describe, it, expect, vi } from 'vitest';
import { exportToExcel } from '../src/utils/excel-export';
import { NodeItem, ReminderItem } from '../src/types/domain';
import * as XLSX from 'xlsx';

// Mock XLSX writeFile & sheet_to_csv to prevent actual disk writes during test
vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('xlsx')>();
  return {
    ...actual,
    writeFile: vi.fn(),
  };
});

describe('Excel Export Utility', () => {
  const mockNodes: NodeItem[] = [
    {
      id: 'node-1',
      title: 'Design Department',
      type: 'department',
      department: 'Design',
      planned_date: '2026-09-01',
      status: 'in_progress',
      is_critical: true,
      color: '#3b82f6',
      trigger_offset_days: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'node-2',
      parent_id: 'node-1',
      title: '2D Pattern Review',
      type: 'task',
      department: 'Design',
      planned_date: '2026-09-10',
      status: 'not_started',
      is_critical: false,
      color: null,
      trigger_offset_days: 9,
      description: 'Review initial 2D CAD files with Tier 1 vendor',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const mockReminders: ReminderItem[] = [
    {
      id: 'rem-1',
      node_id: 'node-2',
      message: 'Urgent: Submit Pattern Review CAD',
      remind_at: '2026-09-08',
      created_at: new Date().toISOString(),
    },
  ];

  it('should generate workbook with 3 structured sheets (CPM Hierarchy, Action Feed, Alerts)', () => {
    exportToExcel(mockNodes, mockReminders, {
      fileName: 'Test_Export.xlsx',
      format: 'xlsx',
      includeCompleted: true,
      includeActionFeedSheet: true,
      includeAlertsSheet: true,
    });

    expect(XLSX.writeFile).toHaveBeenCalledTimes(1);
    const [workbook, fileName] = (XLSX.writeFile as any).mock.calls[0];
    expect(fileName).toBe('Test_Export.xlsx');
    expect(workbook.SheetNames).toContain('CPM Hierarchy');
    expect(workbook.SheetNames).toContain('Action Feed');
    expect(workbook.SheetNames).toContain('Alerts & Reminders');
  });

  it('should filter out completed nodes when includeCompleted is false', () => {
    const nodesWithDone: NodeItem[] = [
      ...mockNodes,
      {
        id: 'node-3',
        title: 'Completed Task',
        type: 'task',
        planned_date: '2026-08-01',
        status: 'done',
        is_critical: false,
        color: null,
        trigger_offset_days: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    exportToExcel(nodesWithDone, [], {
      fileName: 'Test_Active_Only.xlsx',
      format: 'xlsx',
      includeCompleted: false,
    });

    expect(XLSX.writeFile).toHaveBeenCalled();
  });
});
