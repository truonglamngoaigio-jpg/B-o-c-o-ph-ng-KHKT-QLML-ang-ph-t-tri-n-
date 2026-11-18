import { WaterProject, WeekPeriod, WeeklyReport } from '../types';

export function isProjectSettled(
  project: Pick<WaterProject, 'targetEndDate'>
): boolean {
  const normalized = (project.targetEndDate || '').trim().toUpperCase();
  return normalized.includes('ĐÃ QUYẾT TOÁN');
}

export function isProjectReportLocked(
  project: Pick<WaterProject, 'targetEndDate' | 'reportLocked'>
): boolean {
  if (typeof project.reportLocked === 'boolean') {
    return project.reportLocked;
  }
  return isProjectSettled(project);
}

export interface EffectiveWeekReport {
  report: WeeklyReport | null;
  isCarriedSettled: boolean;
  settledFromWeekLabel?: string;
}

export function resolveEffectiveReportForWeek(params: {
  project: WaterProject;
  weekId: string;
  weeks: WeekPeriod[];
  reports: WeeklyReport[];
}): EffectiveWeekReport {
  const { project, weekId, weeks, reports } = params;

  const exact = reports.find(
    (r) => r.projectId === project.id && r.weekId === weekId
  );
  if (exact) {
    return {
      report: exact,
      isCarriedSettled: false,
    };
  }

  if (!isProjectReportLocked(project)) {
    return {
      report: null,
      isCarriedSettled: false,
    };
  }

  const weekOrder = new Map<string, number>();
  weeks.forEach((w, idx) => weekOrder.set(w.id, idx));
  const selectedIdx = weekOrder.get(weekId) ?? weeks.length - 1;

  let latestReport: WeeklyReport | null = null;
  let latestIdx = -1;

  for (const rep of reports) {
    if (rep.projectId !== project.id) continue;
    const idx = weekOrder.get(rep.weekId);
    if (idx !== undefined && idx <= selectedIdx && idx >= latestIdx) {
      latestIdx = idx;
      latestReport = rep;
    }
  }

  if (latestReport) {
    return {
      report: latestReport,
      isCarriedSettled: true,
      settledFromWeekLabel: weeks[latestIdx]?.label,
    };
  }

  return {
    report: null,
    isCarriedSettled: false,
  };
}
