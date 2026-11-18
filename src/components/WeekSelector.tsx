import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { WeekPeriod } from '../types';

interface WeekSelectorProps {
  weeks: WeekPeriod[];
  selectedWeekId: string;
  onChangeWeek: (weekId: string) => void;
}

export function WeekSelector({
  weeks,
  selectedWeekId,
  onChangeWeek,
}: WeekSelectorProps) {
  const currentIndex = weeks.findIndex((w) => w.id === selectedWeekId);
  const selectedWeek = weeks[currentIndex] ?? weeks[0];

  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex >= 0 && currentIndex < weeks.length - 1;

  return (
    <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-1 shrink-0">
      <button
        type="button"
        onClick={() => canGoPrev && onChangeWeek(weeks[currentIndex - 1].id)}
        disabled={!canGoPrev}
        aria-label="Tuần trước"
        className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-35 disabled:pointer-events-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <div className="relative flex items-center">
        <Calendar className="w-3.5 h-3.5 text-sky-700 absolute left-2.5 pointer-events-none" />
        <select
          aria-label="Chọn tuần báo cáo"
          value={selectedWeek?.id ?? ''}
          onChange={(e) => onChangeWeek(e.target.value)}
          className="h-8 pl-8 pr-7 text-xs font-medium text-slate-900 bg-transparent rounded-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 tabular-nums whitespace-nowrap"
        >
          {weeks.map((week) => (
            <option key={week.id} value={week.id}>
              {week.label} ({week.dateRange})
              {week.isCurrent ? ' — Hiện tại' : ''}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={() => canGoNext && onChangeWeek(weeks[currentIndex + 1].id)}
        disabled={!canGoNext}
        aria-label="Tuần kế tiếp"
        className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-35 disabled:pointer-events-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
