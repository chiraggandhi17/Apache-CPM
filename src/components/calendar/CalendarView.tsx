import React, { useState, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useNodes } from '../../context/NodeContext';
import { NodeItem } from '../../types/domain';
import { resolveColor } from '../../lib/color-resolver';
import { Filter, Calendar as CalendarIcon } from 'lucide-react';

interface CalendarViewProps {
  onSelectNode: (node: NodeItem) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ onSelectNode }) => {
  const { nodes } = useNodes();
  const [showFilters, setShowFilters] = useState(false);
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [selectedSeasons, setSelectedSeasons] = useState<string[]>([]);

  const departments = useMemo(() => {
    return Array.from(new Set(nodes.map(n => n.department).filter(Boolean))) as string[];
  }, [nodes]);

  const seasons = useMemo(() => {
    return Array.from(new Set(nodes.map(n => n.season).filter(Boolean))) as string[];
  }, [nodes]);

  const events = useMemo(() => {
    return nodes
      .filter(n => {
        if (!n.planned_date) return false;
        if (selectedDepts.length > 0 && n.department && !selectedDepts.includes(n.department)) return false;
        if (selectedSeasons.length > 0 && n.season && !selectedSeasons.includes(n.season)) return false;
        return true;
      })
      .map(n => {
        const ancestorColors: string[] = [];
        let curr = nodes.find(item => item.id === n.id);
        while (curr) {
          if (curr.color) ancestorColors.unshift(curr.color);
          if (!curr.parent_id) break;
          curr = nodes.find(item => item.id === curr!.parent_id);
        }

        const color = resolveColor(n.color, ancestorColors);

        return {
          id: n.id,
          title: `${n.is_critical ? '⚡ ' : ''}${n.title}`,
          start: n.planned_date!,
          backgroundColor: color,
          borderColor: color,
          textColor: '#ffffff',
          extendedProps: { node: n },
        };
      });
  }, [nodes, selectedDepts, selectedSeasons]);

  const toggleDept = (dept: string) => {
    setSelectedDepts(prev =>
      prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]
    );
  };

  const toggleSeason = (season: string) => {
    setSelectedSeasons(prev =>
      prev.includes(season) ? prev.filter(s => s !== season) : [...prev, season]
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-teal-600" />
          <h2 className="text-base font-bold text-gray-900">Master T&A Calendar</h2>
        </div>

        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className={`px-3 py-1.5 text-xs font-semibold rounded-xl border flex items-center gap-1.5 transition-colors ${
            showFilters || selectedDepts.length > 0 || selectedSeasons.length > 0
              ? 'bg-teal-50 text-teal-800 border-teal-300'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          <span>Filters {selectedDepts.length + selectedSeasons.length > 0 && `(${selectedDepts.length + selectedSeasons.length})`}</span>
        </button>
      </div>

      {showFilters && (
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Filter Milestones</h3>
            <button
              type="button"
              onClick={() => {
                setSelectedDepts([]);
                setSelectedSeasons([]);
              }}
              className="text-xs text-teal-600 font-medium hover:underline"
            >
              Reset Filters
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="block font-semibold text-gray-600 mb-1.5">Department</span>
              <div className="flex flex-wrap gap-1.5">
                {departments.map(dept => (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => toggleDept(dept)}
                    className={`px-2.5 py-1 rounded-lg border font-medium transition-colors ${
                      selectedDepts.includes(dept)
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {dept}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block font-semibold text-gray-600 mb-1.5">Season</span>
              <div className="flex flex-wrap gap-1.5">
                {seasons.map(season => (
                  <button
                    key={season}
                    type="button"
                    onClick={() => toggleSeason(season)}
                    className={`px-2.5 py-1 rounded-lg border font-medium transition-colors ${
                      selectedSeasons.includes(season)
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {season}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs font-sans text-xs">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          events={events}
          eventClick={info => {
            const node = info.event.extendedProps.node as NodeItem;
            if (node) onSelectNode(node);
          }}
          height="auto"
          aspectRatio={1.6}
        />
      </div>
    </div>
  );
};
