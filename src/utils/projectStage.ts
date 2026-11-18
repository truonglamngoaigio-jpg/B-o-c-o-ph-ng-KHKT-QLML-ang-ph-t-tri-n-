import { ReportStatus, WaterProject, WeekPeriod, WeeklyReport } from '../types';

export interface ProjectStageOption {
  value: string;
  label: string;
  reportStatus: ReportStatus;
  toneClass: string;
}

export const PROJECT_STAGE_OPTIONS: ProjectStageOption[] = [
  {
    value: 'THIẾT KẾ',
    label: 'THIẾT KẾ',
    reportStatus: 'on_track',
    toneClass: 'text-rose-700',
  },
  {
    value: 'PHÊ DUYỆT',
    label: 'PHÊ DUYỆT',
    reportStatus: 'on_track',
    toneClass: 'text-rose-700',
  },
  {
    value: 'CHỈNH SỬA TK',
    label: 'CHỈNH SỬA TK',
    reportStatus: 'attention',
    toneClass: 'text-rose-700',
  },
  {
    value: 'THI CÔNG',
    label: 'THI CÔNG',
    reportStatus: 'on_track',
    toneClass: 'text-amber-800',
  },
  {
    value: 'CHƯA THI CÔNG',
    label: 'CHƯA THI CÔNG',
    reportStatus: 'attention',
    toneClass: 'text-amber-800',
  },
  {
    value: 'ĐANG THI CÔNG',
    label: 'ĐANG THI CÔNG',
    reportStatus: 'on_track',
    toneClass: 'text-amber-800',
  },
  {
    value: 'THI CÔNG XONG',
    label: 'THI CÔNG XONG',
    reportStatus: 'on_track',
    toneClass: 'text-violet-700',
  },
  {
    value: 'ĐÃ QUYẾT TOÁN',
    label: 'ĐÃ QUYẾT TOÁN',
    reportStatus: 'on_track',
    toneClass: 'text-violet-700',
  },
  {
    value: 'ĐANG QT',
    label: 'ĐANG QT',
    reportStatus: 'on_track',
    toneClass: 'text-violet-700',
  },
  {
    value: 'TẠM NGỪNG',
    label: 'TẠM NGỪNG',
    reportStatus: 'delayed',
    toneClass: 'text-slate-700',
  },
  {
    value: 'TT HỢP ĐỒNG',
    label: 'TT HỢP ĐỒNG',
    reportStatus: 'attention',
    toneClass: 'text-slate-700',
  },
  {
    value: 'ĐANG XIN PHÉP',
    label: 'ĐANG XIN PHÉP',
    reportStatus: 'attention',
    toneClass: 'text-sky-700',
  },
  {
    value: 'VƯỚNG MẮC',
    label: 'VƯỚNG MẮC',
    reportStatus: 'delayed',
    toneClass: 'text-red-700',
  },
  {
    value: 'DELAY THỰC HIỆN CTRINH ƯU TIÊN',
    label: 'DELAY THỰC HIỆN CTRINH ƯU TIÊN',
    reportStatus: 'delayed',
    toneClass: 'text-red-700',
  },
];

const STAGE_MAP = new Map<string, ProjectStageOption>(
  PROJECT_STAGE_OPTIONS.map((opt) => [opt.value.toUpperCase(), opt])
);

export function normalizeProjectStage(raw: string | undefined): string {
  const cleaned = (raw ?? '').trim();
  if (!cleaned) return 'CHƯA THI CÔNG';
  const upper = cleaned.toUpperCase();
  if (upper === 'ĐANG QUYẾT TOÁN') return 'ĐANG QT';
  if (STAGE_MAP.has(upper)) return STAGE_MAP.get(upper)!.value;
  return cleaned;
}

export function mapProjectStageToReportStatus(
  stage: string | undefined,
  hasIssuesText = false
): ReportStatus {
  const normalized = normalizeProjectStage(stage).toUpperCase();
  const matched = STAGE_MAP.get(normalized);
  if (matched) {
    if (matched.reportStatus === 'delayed') return 'delayed';
    if (hasIssuesText && matched.reportStatus === 'on_track') {
      return 'attention';
    }
    return matched.reportStatus;
  }

  if (
    normalized.includes('TẠM NGỪNG') ||
    normalized.includes('VƯỚNG MẮC') ||
    normalized.includes('DELAY') ||
    normalized.includes('CHẬM')
  ) {
    return 'delayed';
  }
  if (
    normalized.includes('CHƯA') ||
    normalized.includes('XIN PHÉP') ||
    normalized.includes('CHỈNH SỬA') ||
    normalized.includes('HỢP ĐỒNG') ||
    hasIssuesText
  ) {
    return 'attention';
  }
  return 'on_track';
}

export function getProjectStageToneClass(stage: string | undefined): string {
  const normalized = normalizeProjectStage(stage).toUpperCase();
  const matched = STAGE_MAP.get(normalized);
  if (matched) return matched.toneClass;
  const status = mapProjectStageToReportStatus(stage);
  if (status === 'delayed') return 'text-red-700';
  if (status === 'attention') return 'text-amber-700';
  return 'text-sky-800';
}

export interface InheritedStageResolution {
  stage: string;
  source: 'current_week' | 'previous_week' | 'project_default';
  sourceWeekLabel?: string;
}

export function resolveInheritedProjectStage(params: {
  project: WaterProject;
  weekId: string;
  weeks: WeekPeriod[];
  reports: WeeklyReport[];
}): InheritedStageResolution {
  const { project, weekId, weeks, reports } = params;
  const selectedIndex = weeks.findIndex((w) => w.id === weekId);
  const effectiveIdx = selectedIndex >= 0 ? selectedIndex : weeks.length - 1;

  const currentReport = reports.find(
    (r) => r.projectId === project.id && r.weekId === weekId
  );
  if (currentReport?.projectStage) {
    return {
      stage: normalizeProjectStage(currentReport.projectStage),
      source: 'current_week',
      sourceWeekLabel: weeks[effectiveIdx]?.label,
    };
  }

  for (let i = effectiveIdx - 1; i >= 0; i--) {
    const priorWeek = weeks[i];
    const priorReport = reports.find(
      (r) => r.projectId === project.id && r.weekId === priorWeek.id
    );
    if (priorReport?.projectStage) {
      return {
        stage: normalizeProjectStage(priorReport.projectStage),
        source: 'previous_week',
        sourceWeekLabel: priorWeek.label,
      };
    }
  }

  // Fallback: check if any prior week had a report whose status implies a stage,
  // otherwise use project's baseline progress label (targetEndDate).
  const baseStage =
    project.targetEndDate &&
    project.targetEndDate.trim().toUpperCase() !== 'CHƯA CẬP NHẬT'
      ? normalizeProjectStage(project.targetEndDate)
      : 'CHƯA THI CÔNG';

  return {
    stage: baseStage,
    source: 'project_default',
  };
}
