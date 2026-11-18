import { useCallback, useEffect, useState } from 'react';
import { INITIAL_DATABASE_STATE } from '../data/initialData';
import {
  AppDatabaseState,
  PipeSpec,
  ProjectCategory,
  ProjectGroupDefinition,
  ReportStatus,
  Supervisor,
  WaterProject,
  WeeklyReport,
} from '../types';
import {
  parseApprovedPipesFromText,
  projectHasWaterPipes,
} from '../utils/pipeProgress';
import { inferProjectGrouping } from '../utils/projectGrouping';
import {
  isProjectReportLocked,
  isProjectSettled,
} from '../utils/projectLock';
import {
  mapProjectStageToReportStatus,
  normalizeProjectStage,
} from '../utils/projectStage';

const STORAGE_KEY = 'water_supply_projects_db_v3';
const BROADCAST_CHANNEL_NAME = 'water_supply_projects_sync_v3';

function normalizeLoadedProjects(projects: WaterProject[]): WaterProject[] {
  return projects.map((p) => {
    const inferred =
      !p.capitalGroup || !p.areaGroup
        ? inferProjectGrouping(p.id, p.location)
        : null;
    const hasWaterPipes = projectHasWaterPipes(p);
    const approvedPipes =
      hasWaterPipes && (!p.approvedPipes || p.approvedPipes.length === 0)
        ? parseApprovedPipesFromText(p.id, p.totalPlannedVolume, p.name)
        : p.approvedPipes;

    const settledLocked =
      p.reportLocked === undefined && isProjectSettled(p)
        ? {
            reportLocked: true,
            reportLockedAt: p.reportLockedAt ?? '14/11/2026 17:00',
          }
        : {};

    return {
      ...p,
      capitalGroup: p.capitalGroup || inferred!.capitalGroup,
      areaGroup: p.areaGroup || inferred!.areaGroup,
      ...(approvedPipes !== undefined ? { approvedPipes } : {}),
      ...settledLocked,
    };
  });
}

function normalizeLoadedReports(
  reports: WeeklyReport[],
  projects: WaterProject[]
): WeeklyReport[] {
  const projectMap = new Map<string, WaterProject>();
  for (const p of projects) {
    projectMap.set(p.id, p);
  }
  return reports.map((r) => {
    if (r.projectStage) return r;
    const proj = projectMap.get(r.projectId);
    if (
      proj?.targetEndDate &&
      proj.targetEndDate.trim().toUpperCase() !== 'CHƯA CẬP NHẬT'
    ) {
      return {
        ...r,
        projectStage: normalizeProjectStage(proj.targetEndDate),
      };
    }
    return r;
  });
}

function loadStateFromStorage(): AppDatabaseState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return INITIAL_DATABASE_STATE;
    }
    const parsed = JSON.parse(raw) as AppDatabaseState;
    if (
      !parsed ||
      !Array.isArray(parsed.supervisors) ||
      !Array.isArray(parsed.projects) ||
      !Array.isArray(parsed.reports)
    ) {
      return INITIAL_DATABASE_STATE;
    }
    const normalizedProjects = normalizeLoadedProjects(parsed.projects);
    return {
      ...parsed,
      projects: normalizedProjects,
      reports: normalizeLoadedReports(parsed.reports, normalizedProjects),
      projectGroups: Array.isArray(parsed.projectGroups)
        ? parsed.projectGroups
        : [],
    };
  } catch {
    return INITIAL_DATABASE_STATE;
  }
}

export function computeInitials(name: string): string {
  const cleaned = name
    .replace(/^(KS\.|ThS\.|TS\.|CN\.|Ông|Bà)\s*/i, '')
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'GS';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatNowTimestamp(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

export function useWaterProjectsStore() {
  const [state, setState] = useState<AppDatabaseState>(() => loadStateFromStorage());

  const persistAndBroadcast = useCallback((next: AppDatabaseState) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      if ('BroadcastChannel' in window) {
        const ch = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        ch.postMessage(next);
        ch.close();
      }
    } catch {
      // Ignore storage quota errors gracefully
    }
  }, []);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setState(JSON.parse(e.newValue));
        } catch {
          // Ignore malformed external update
        }
      }
    };
    window.addEventListener('storage', handleStorage);

    let channel: BroadcastChannel | null = null;
    if ('BroadcastChannel' in window) {
      channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      channel.onmessage = (event) => {
        if (event.data) {
          setState(event.data as AppDatabaseState);
        }
      };
    }

    return () => {
      window.removeEventListener('storage', handleStorage);
      channel?.close();
    };
  }, []);

  const updateState = useCallback(
    (updater: (prev: AppDatabaseState) => AppDatabaseState) => {
      setState((prev) => {
        const next = updater(prev);
        persistAndBroadcast(next);
        return next;
      });
    },
    [persistAndBroadcast]
  );

  const assignSupervisor = useCallback(
    (projectId: string, supervisorId: string | null) => {
      updateState((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === projectId && !isProjectReportLocked(p)
            ? { ...p, supervisorId }
            : p
        ),
      }));
    },
    [updateState]
  );

  const upsertWeeklyReport = useCallback(
    (input: {
      projectId: string;
      weekId: string;
      supervisorId: string | null;
      status?: ReportStatus;
      projectStage?: string;
      cumulativeProgress: number;
      weeklyProgressDelta: number;
      weeklyVolume: string;
      summary: string;
      issues: string;
      leaderNote?: string;
      pipeLengths?: Record<string, number>;
    }) => {
      const reportId = `${input.projectId}__${input.weekId}`;
      updateState((prev) => {
        const targetProject = prev.projects.find((p) => p.id === input.projectId);
        if (targetProject && isProjectReportLocked(targetProject)) {
          return prev;
        }
        const existingIndex = prev.reports.findIndex(
          (r) => r.projectId === input.projectId && r.weekId === input.weekId
        );
        const existing = existingIndex >= 0 ? prev.reports[existingIndex] : null;
        const resolvedPipeLengths =
          input.pipeLengths !== undefined
            ? input.pipeLengths
            : existing?.pipeLengths;
        const normalizedStage = input.projectStage
          ? normalizeProjectStage(input.projectStage)
          : existing?.projectStage;
        const derivedStatus: ReportStatus = normalizedStage
          ? mapProjectStageToReportStatus(
              normalizedStage,
              Boolean(input.issues.trim())
            )
          : input.status ?? existing?.status ?? 'on_track';

        const nextReport: WeeklyReport = {
          id: existing?.id ?? reportId,
          projectId: input.projectId,
          weekId: input.weekId,
          supervisorIdAtSubmission: input.supervisorId,
          submittedAt: formatNowTimestamp(),
          status: derivedStatus,
          ...(normalizedStage ? { projectStage: normalizedStage } : {}),
          cumulativeProgress: Math.max(0, Math.min(100, input.cumulativeProgress)),
          weeklyProgressDelta: Math.max(0, Math.min(100, input.weeklyProgressDelta)),
          weeklyVolume: input.weeklyVolume.trim(),
          summary: input.summary.trim(),
          issues: input.issues.trim(),
          leaderNote:
            input.leaderNote !== undefined
              ? input.leaderNote.trim()
              : existing?.leaderNote ?? '',
          ...(resolvedPipeLengths ? { pipeLengths: resolvedPipeLengths } : {}),
        };

        const nextProjects = normalizedStage
          ? prev.projects.map((p) =>
              p.id === input.projectId
                ? { ...p, targetEndDate: normalizedStage }
                : p
            )
          : prev.projects;

        if (existingIndex >= 0) {
          const updatedReports = [...prev.reports];
          updatedReports[existingIndex] = nextReport;
          return { ...prev, projects: nextProjects, reports: updatedReports };
        }

        return {
          ...prev,
          projects: nextProjects,
          reports: [...prev.reports, nextReport],
        };
      });
    },
    [updateState]
  );

  const updateLeaderNote = useCallback(
    (projectId: string, weekId: string, leaderNote: string) => {
      updateState((prev) => {
        const targetProject = prev.projects.find((p) => p.id === projectId);
        if (targetProject && isProjectReportLocked(targetProject)) {
          return prev;
        }
        return {
          ...prev,
          reports: prev.reports.map((r) =>
            r.projectId === projectId && r.weekId === weekId
              ? { ...r, leaderNote: leaderNote.trim() }
              : r
          ),
        };
      });
    },
    [updateState]
  );

  const addProject = useCallback(
    (input: {
      code: string;
      name: string;
      capitalGroup?: string;
      areaGroup?: string;
      location: string;
      category: ProjectCategory;
      supervisorId: string | null;
      budgetBillionVND: number;
      targetEndDate: string;
      totalPlannedVolume: string;
      approvedPipes?: PipeSpec[];
    }) => {
      const inferred = inferProjectGrouping(input.code.trim(), input.location);
      const projId = `proj-${Date.now()}`;
      const hasWaterPipes = projectHasWaterPipes({
        category: input.category,
        name: input.name,
        totalPlannedVolume: input.totalPlannedVolume,
        approvedPipes: input.approvedPipes,
      });
      const resolvedPipes =
        input.approvedPipes && input.approvedPipes.length > 0
          ? input.approvedPipes
          : hasWaterPipes
            ? parseApprovedPipesFromText(
                projId,
                input.totalPlannedVolume,
                input.name
              )
            : undefined;

      const trimmedEnd = input.targetEndDate.trim();
      const settled = isProjectSettled({ targetEndDate: trimmedEnd });

      const newProject: WaterProject = {
        id: projId,
        code: input.code.trim(),
        name: input.name.trim(),
        capitalGroup: input.capitalGroup?.trim() || inferred.capitalGroup,
        areaGroup: input.areaGroup?.trim() || inferred.areaGroup,
        location: input.location.trim(),
        category: input.category,
        supervisorId: input.supervisorId,
        budgetBillionVND: input.budgetBillionVND,
        targetEndDate: trimmedEnd,
        totalPlannedVolume: input.totalPlannedVolume.trim(),
        ...(resolvedPipes !== undefined ? { approvedPipes: resolvedPipes } : {}),
        ...(settled
          ? { reportLocked: true, reportLockedAt: formatNowTimestamp() }
          : {}),
      };
      updateState((prev) => ({
        ...prev,
        projects: [newProject, ...prev.projects],
      }));
      return newProject;
    },
    [updateState]
  );

  const updateProjectApprovedPipes = useCallback(
    (projectId: string, approvedPipes: PipeSpec[]) => {
      const sanitized = approvedPipes
        .map((spec, idx) => ({
          id: spec.id || `${projectId}-pipe-${Date.now()}-${idx + 1}`,
          label: spec.label.trim(),
          approvedLengthM: Math.max(0, Number(spec.approvedLengthM) || 0),
          baselineCompletedM: Math.max(0, Number(spec.baselineCompletedM) || 0),
        }))
        .filter((spec) => spec.label);

      updateState((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === projectId && !isProjectReportLocked(p)
            ? { ...p, approvedPipes: sanitized }
            : p
        ),
      }));
    },
    [updateState]
  );

  const reopenProjectReport = useCallback(
    (projectId: string) => {
      const nowStamp = formatNowTimestamp();
      updateState((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                reportLocked: false,
                reportReopenedAt: nowStamp,
              }
            : p
        ),
      }));
    },
    [updateState]
  );

  const lockProjectReport = useCallback(
    (projectId: string, markSettled = true) => {
      const nowStamp = formatNowTimestamp();
      updateState((prev) => ({
        ...prev,
        projects: prev.projects.map((p) => {
          if (p.id !== projectId) return p;
          const nextTargetEnd =
            markSettled && !isProjectSettled(p)
              ? 'ĐÃ QUYẾT TOÁN'
              : p.targetEndDate;
          return {
            ...p,
            targetEndDate: nextTargetEnd,
            reportLocked: true,
            reportLockedAt: nowStamp,
          };
        }),
      }));
    },
    [updateState]
  );

  const addSupervisor = useCallback(
    (input: {
      name: string;
      role: string;
      specialty: string;
      phone: string;
    }) => {
      const newSupervisor: Supervisor = {
        id: `sup-${Date.now()}`,
        name: input.name.trim(),
        role: input.role.trim() || 'Giám sát công trình',
        specialty: input.specialty.trim() || 'Hạ tầng cấp nước',
        phone: input.phone.trim() || 'Đang cập nhật',
        initials: computeInitials(input.name),
      };
      updateState((prev) => ({
        ...prev,
        supervisors: [...prev.supervisors, newSupervisor],
      }));
      return newSupervisor;
    },
    [updateState]
  );

  const addProjectGroup = useCallback(
    (input: { capitalGroup: string; areas: string[] }) => {
      const cap = input.capitalGroup.trim();
      if (!cap) return;
      const cleanAreas = input.areas.map((a) => a.trim()).filter(Boolean);

      updateState((prev) => {
        const existingGroups: ProjectGroupDefinition[] = [
          ...(prev.projectGroups ?? []),
        ];
        const idx = existingGroups.findIndex(
          (g) => g.capitalGroup.toLowerCase() === cap.toLowerCase()
        );
        if (idx >= 0) {
          const mergedAreas = Array.from(
            new Set([...existingGroups[idx].areas, ...cleanAreas])
          );
          existingGroups[idx] = {
            ...existingGroups[idx],
            areas: mergedAreas,
          };
        } else {
          existingGroups.push({
            capitalGroup: cap,
            areas: cleanAreas.length > 0 ? cleanAreas : ['Khu vực chung'],
          });
        }
        return {
          ...prev,
          projectGroups: existingGroups,
        };
      });
    },
    [updateState]
  );

  const updateProjectGroup = useCallback(
    (projectId: string, capitalGroup: string, areaGroup: string) => {
      const cap = capitalGroup.trim();
      const area = areaGroup.trim();
      if (!cap || !area) return;
      updateState((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === projectId && !isProjectReportLocked(p)
            ? { ...p, capitalGroup: cap, areaGroup: area }
            : p
        ),
      }));
    },
    [updateState]
  );

  const resetDemoData = useCallback(() => {
    persistAndBroadcast(INITIAL_DATABASE_STATE);
    setState(INITIAL_DATABASE_STATE);
  }, [persistAndBroadcast]);

  const importBatchData = useCallback(
    (params: {
      rows: {
        code: string;
        name: string;
        capitalGroup?: string;
        areaGroup?: string;
        location: string;
        category: ProjectCategory;
        supervisorName: string | null;
        budgetBillionVND: number;
        targetEndDate: string;
        totalPlannedVolume: string;
        hasReportData: boolean;
        status: ReportStatus;
        cumulativeProgress: number;
        weeklyProgressDelta: number;
        weeklyVolume: string;
        summary: string;
        issues: string;
        leaderNote: string;
      }[];
      weekId: string;
      mode: 'replace' | 'merge';
    }) => {
      const { rows, weekId, mode } = params;
      const nowStamp = formatNowTimestamp();

      updateState((prev) => {
        const baseSupervisors: Supervisor[] =
          mode === 'replace' ? [] : [...prev.supervisors];
        const baseProjects: WaterProject[] =
          mode === 'replace' ? [] : [...prev.projects];
        const baseReports: WeeklyReport[] =
          mode === 'replace' ? [] : [...prev.reports];

        const supervisorByName = new Map<string, Supervisor>();
        for (const s of baseSupervisors) {
          supervisorByName.set(s.name.trim().toLowerCase(), s);
        }

        const stamp = Date.now();
        let supSeq = 1;
        let projSeq = 1;

        for (const row of rows) {
          let supervisorId: string | null = null;
          if (row.supervisorName) {
            const key = row.supervisorName.trim().toLowerCase();
            let sup = supervisorByName.get(key);
            if (!sup) {
              sup = {
                id: `sup-imp-${stamp}-${supSeq++}`,
                name: row.supervisorName.trim(),
                role: 'Giám sát công trình',
                specialty: row.category,
                phone: 'Đang cập nhật',
                initials: computeInitials(row.supervisorName),
              };
              baseSupervisors.push(sup);
              supervisorByName.set(key, sup);
            }
            supervisorId = sup.id;
          }

          const inferred = inferProjectGrouping(row.code, row.location);
          const resolvedCapital = row.capitalGroup?.trim() || inferred.capitalGroup;
          const resolvedArea = row.areaGroup?.trim() || inferred.areaGroup;

          const existingProjIdx = baseProjects.findIndex(
            (p) =>
              p.code.toLowerCase() === row.code.toLowerCase() ||
              p.name.toLowerCase() === row.name.toLowerCase()
          );

          let projectId: string;
          if (existingProjIdx >= 0) {
            const existing = baseProjects[existingProjIdx];
            projectId = existing.id;
            baseProjects[existingProjIdx] = {
              ...existing,
              code: row.code || existing.code,
              name: row.name,
              capitalGroup: row.capitalGroup?.trim() || existing.capitalGroup || resolvedCapital,
              areaGroup: row.areaGroup?.trim() || existing.areaGroup || resolvedArea,
              location:
                row.location !== 'Đang cập nhật'
                  ? row.location
                  : existing.location,
              category: row.category,
              supervisorId:
                supervisorId !== null ? supervisorId : existing.supervisorId,
              budgetBillionVND:
                row.budgetBillionVND > 0
                  ? row.budgetBillionVND
                  : existing.budgetBillionVND,
              targetEndDate:
                row.targetEndDate !== 'Đang cập nhật'
                  ? row.targetEndDate
                  : existing.targetEndDate,
              totalPlannedVolume:
                row.totalPlannedVolume !== 'Theo hồ sơ thiết kế'
                  ? row.totalPlannedVolume
                  : existing.totalPlannedVolume,
            };
          } else {
            projectId = `proj-imp-${stamp}-${projSeq++}`;
            const settled = isProjectSettled({ targetEndDate: row.targetEndDate });
            baseProjects.push({
              id: projectId,
              code: row.code,
              name: row.name,
              capitalGroup: resolvedCapital,
              areaGroup: resolvedArea,
              location: row.location,
              category: row.category,
              supervisorId,
              budgetBillionVND: row.budgetBillionVND,
              targetEndDate: row.targetEndDate,
              totalPlannedVolume: row.totalPlannedVolume,
              ...(settled ? { reportLocked: true, reportLockedAt: nowStamp } : {}),
            });
          }

          if (row.hasReportData) {
            const repIdx = baseReports.findIndex(
              (r) => r.projectId === projectId && r.weekId === weekId
            );
            const nextReport: WeeklyReport = {
              id: `${projectId}__${weekId}`,
              projectId,
              weekId,
              supervisorIdAtSubmission: supervisorId,
              submittedAt: nowStamp,
              status: row.status,
              cumulativeProgress: row.cumulativeProgress,
              weeklyProgressDelta: row.weeklyProgressDelta,
              weeklyVolume: row.weeklyVolume,
              summary: row.summary,
              issues: row.issues,
              leaderNote: row.leaderNote,
            };

            if (repIdx >= 0) {
              baseReports[repIdx] = nextReport;
            } else {
              baseReports.push(nextReport);
            }
          }
        }

        return {
          supervisors: baseSupervisors,
          projects: baseProjects,
          reports: baseReports,
        };
      });
    },
    [updateState]
  );

  return {
    supervisors: state.supervisors,
    projects: state.projects,
    reports: state.reports,
    projectGroups: state.projectGroups ?? [],
    assignSupervisor,
    upsertWeeklyReport,
    updateLeaderNote,
    addProject,
    addSupervisor,
    addProjectGroup,
    updateProjectGroup,
    updateProjectApprovedPipes,
    reopenProjectReport,
    lockProjectReport,
    importBatchData,
    resetDemoData,
  };
}
