import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Edit3,
  FileDown,
  FileSpreadsheet,
  History,
  Layers,
  Lock,
  MapPin,
  MessageSquareText,
  Plus,
  Ruler,
  Search,
  Send,
  Trash2,
  Unlock,
} from 'lucide-react';
import {
  PipeSpec,
  ReportStatus,
  Supervisor,
  WaterProject,
  WeekPeriod,
  WeeklyReport,
} from '../types';
import { exportSupervisorExcel } from '../utils/exportExcel';
import {
  PdfReportModel,
  prepareSupervisorPdfModel,
} from '../utils/exportPdf';
import {
  PIPE_GRADE_PRESETS,
  computeProjectPipeSummary,
  evaluateSupervisorProgress,
  formatMeters,
  projectHasWaterPipes,
} from '../utils/pipeProgress';
import {
  EffectiveWeekReport,
  isProjectReportLocked,
  isProjectSettled,
  resolveEffectiveReportForWeek,
} from '../utils/projectLock';
import {
  groupProjectsByCapitalAndArea,
  shouldRenderAreaSubDivider,
} from '../utils/projectGrouping';
import {
  PROJECT_STAGE_OPTIONS,
  getProjectStageToneClass,
  mapProjectStageToReportStatus,
  resolveInheritedProjectStage,
} from '../utils/projectStage';
import { PdfPreviewModal } from './PdfPreviewModal';
import { StatusIndicator } from './StatusIndicator';
import { WeekSelector } from './WeekSelector';

interface SupervisorViewProps {
  supervisor: Supervisor;
  weeks: WeekPeriod[];
  selectedWeekId: string;
  onChangeWeek: (weekId: string) => void;
  projects: WaterProject[];
  reports: WeeklyReport[];
  onSaveWeeklyReport: (input: {
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
    pipeLengths?: Record<string, number>;
  }) => void;
  onUpdateApprovedPipes: (projectId: string, approvedPipes: PipeSpec[]) => void;
  onReopenProjectReport: (projectId: string) => void;
  onLockProjectReport: (projectId: string, markSettled?: boolean) => void;
  onBackToLeadership: () => void;
}

interface ReportFormDraft {
  projectStage: string;
  cumulativeProgress: number;
  weeklyProgressDelta: number;
  weeklyVolume: string;
  summary: string;
  issues: string;
  pipeLengths: Record<string, number>;
}

type ListFilter = 'all' | 'pending' | 'submitted';

export function SupervisorView({
  supervisor,
  weeks,
  selectedWeekId,
  onChangeWeek,
  projects,
  reports,
  onSaveWeeklyReport,
  onUpdateApprovedPipes,
  onReopenProjectReport,
  onLockProjectReport,
  onBackToLeadership,
}: SupervisorViewProps) {
  const selectedWeek =
    weeks.find((w) => w.id === selectedWeekId) ?? weeks[0];

  const assignedProjects = useMemo(
    () => projects.filter((p) => p.supervisorId === supervisor.id),
    [projects, supervisor.id]
  );

  const reportByProjectForWeek = useMemo(() => {
    const map = new Map<string, EffectiveWeekReport>();
    for (const p of assignedProjects) {
      map.set(
        p.id,
        resolveEffectiveReportForWeek({
          project: p,
          weekId: selectedWeekId,
          weeks,
          reports,
        })
      );
    }
    return map;
  }, [assignedProjects, reports, selectedWeekId, weeks]);

  const stats = useMemo(() => {
    let submitted = 0;
    let issues = 0;
    for (const p of assignedProjects) {
      const rep = reportByProjectForWeek.get(p.id)?.report;
      const locked = isProjectReportLocked(p);
      if (rep || locked) {
        submitted += 1;
        if (
          rep &&
          (rep.status === 'attention' ||
            rep.status === 'delayed' ||
            rep.issues)
        ) {
          issues += 1;
        }
      }
    }
    return {
      total: assignedProjects.length,
      submitted,
      pending: assignedProjects.length - submitted,
      issues,
    };
  }, [assignedProjects, reportByProjectForWeek]);

  const supervisorEvaluation = useMemo(
    () =>
      evaluateSupervisorProgress({
        supervisorProjects: assignedProjects,
        weekId: selectedWeek.id,
        weeks,
        reports,
      }),
    [assignedProjects, selectedWeek.id, weeks, reports]
  );

  const projectPipePctMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of assignedProjects) {
      if ((p.approvedPipes?.length ?? 0) > 0) {
        const s = computeProjectPipeSummary({
          project: p,
          weekId: selectedWeek.id,
          weeks,
          reports,
        });
        if (s.hasPipes && s.hasApprovedLengths) {
          map.set(p.id, s.cumulativePct);
        }
      }
    }
    return map;
  }, [assignedProjects, selectedWeek.id, weeks, reports]);

  // Compact list filtering & selection state
  const [searchQuery, setSearchQuery] = useState('');
  const [listFilter, setListFilter] = useState<ListFilter>('all');
  const [previewPdfModel, setPreviewPdfModel] =
    useState<PdfReportModel | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    assignedProjects[0]?.id ?? null
  );

  const filteredAssignedProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return assignedProjects.filter((p) => {
      const hasReport =
        Boolean(reportByProjectForWeek.get(p.id)?.report) ||
        isProjectReportLocked(p);
      if (listFilter === 'pending' && hasReport) return false;
      if (listFilter === 'submitted' && !hasReport) return false;
      if (q) {
        const hay = `${p.code} ${p.name} ${p.capitalGroup} ${p.areaGroup} ${p.location} ${p.category}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [assignedProjects, listFilter, reportByProjectForWeek, searchQuery]);

  const groupedAssignedProjects = useMemo(
    () => groupProjectsByCapitalAndArea(filteredAssignedProjects),
    [filteredAssignedProjects]
  );

  const orderedFilteredProjects = useMemo(() => {
    const list: WaterProject[] = [];
    for (const cap of groupedAssignedProjects) {
      for (const area of cap.areas) {
        list.push(...area.projects);
      }
    }
    return list;
  }, [groupedAssignedProjects]);

  // Keep selectedProjectId valid when switching supervisor tabs or filters
  useEffect(() => {
    const stillExistsInAssigned = assignedProjects.some(
      (p) => p.id === selectedProjectId
    );
    if (!stillExistsInAssigned) {
      setSelectedProjectId(orderedFilteredProjects[0]?.id ?? assignedProjects[0]?.id ?? null);
    }
  }, [assignedProjects, orderedFilteredProjects, selectedProjectId]);

  const activeProject = useMemo(() => {
    return (
      assignedProjects.find((p) => p.id === selectedProjectId) ??
      orderedFilteredProjects[0] ??
      assignedProjects[0] ??
      null
    );
  }, [assignedProjects, orderedFilteredProjects, selectedProjectId]);

  const activeIndexInFiltered = useMemo(() => {
    if (!activeProject) return -1;
    return orderedFilteredProjects.findIndex((p) => p.id === activeProject.id);
  }, [activeProject, orderedFilteredProjects]);

  const activeAllProjectReports = useMemo(() => {
    if (!activeProject) return [];
    return reports.filter((r) => r.projectId === activeProject.id);
  }, [activeProject, reports]);

  const activeEffectiveEntry = useMemo(() => {
    if (!activeProject) return null;
    return reportByProjectForWeek.get(activeProject.id) ?? null;
  }, [activeProject, reportByProjectForWeek]);

  const currentReport = activeEffectiveEntry?.report ?? null;
  const isCarriedSettled = Boolean(activeEffectiveEntry?.isCarriedSettled);
  const settledFromWeekLabel = activeEffectiveEntry?.settledFromWeekLabel;

  const isLocked = activeProject ? isProjectReportLocked(activeProject) : false;
  const isSettled = activeProject ? isProjectSettled(activeProject) : false;

  const latestPreviousReport = useMemo(() => {
    if (!activeProject) return null;
    const selectedIndex = weeks.findIndex((w) => w.id === selectedWeek.id);
    for (let i = selectedIndex - 1; i >= 0; i--) {
      const found = activeAllProjectReports.find(
        (r) => r.weekId === weeks[i].id
      );
      if (found) return found;
    }
    return null;
  }, [activeAllProjectReports, activeProject, selectedWeek.id, weeks]);

  const inheritedStageInfo = useMemo(() => {
    if (!activeProject) return null;
    return resolveInheritedProjectStage({
      project: activeProject,
      weekId: selectedWeek.id,
      weeks,
      reports,
    });
  }, [activeProject, selectedWeek.id, weeks, reports]);

  const buildInitialDraft = (): ReportFormDraft => {
    const initPipeLengths: Record<string, number> = {};
    for (const spec of activeProject?.approvedPipes ?? []) {
      initPipeLengths[spec.id] =
        (!isCarriedSettled ? currentReport?.pipeLengths?.[spec.id] : 0) ?? 0;
    }

    const fallbackStage =
      (activeProject
        ? resolveInheritedProjectStage({
            project: activeProject,
            weekId: selectedWeek.id,
            weeks,
            reports,
          }).stage
        : 'CHƯA THI CÔNG') || 'CHƯA THI CÔNG';

    if (currentReport) {
      return {
        projectStage: currentReport.projectStage || fallbackStage,
        cumulativeProgress: currentReport.cumulativeProgress,
        weeklyProgressDelta: isCarriedSettled
          ? 0
          : currentReport.weeklyProgressDelta,
        weeklyVolume: currentReport.weeklyVolume,
        summary: currentReport.summary,
        issues: currentReport.issues,
        pipeLengths: initPipeLengths,
      };
    }
    return {
      projectStage: fallbackStage,
      cumulativeProgress: latestPreviousReport?.cumulativeProgress ?? 0,
      weeklyProgressDelta: 0,
      weeklyVolume: '',
      summary: '',
      issues: '',
      pipeLengths: initPipeLengths,
    };
  };

  const [isEditing, setIsEditing] = useState<boolean>(
    !isLocked && !currentReport
  );
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [draft, setDraft] = useState<ReportFormDraft>(buildInitialDraft);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [justSaved, setJustSaved] = useState<boolean>(false);

  // Approved pipes editor state
  const [isEditingPipes, setIsEditingPipes] = useState<boolean>(false);
  const [pipeSpecsDraft, setPipeSpecsDraft] = useState<PipeSpec[]>([]);
  const [pipeSaveNotice, setPipeSaveNotice] = useState<string>('');

  useEffect(() => {
    setDraft(buildInitialDraft());
    setIsEditing(!isLocked && !currentReport);
    setErrorMsg('');
    setJustSaved(false);
    setIsEditingPipes(false);
    setPipeSaveNotice('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeProject?.id,
    selectedWeek.id,
    currentReport?.id,
    currentReport?.submittedAt,
  ]);

  useEffect(() => {
    if (isLocked) {
      setIsEditing(false);
      setIsEditingPipes(false);
    }
  }, [isLocked]);

  const pipeSummary = useMemo(() => {
    if (!activeProject) return null;
    return computeProjectPipeSummary({
      project: activeProject,
      weekId: selectedWeek.id,
      weeks,
      reports,
      draftPipeLengths: isEditing && !isLocked ? draft.pipeLengths : undefined,
    });
  }, [
    activeProject,
    selectedWeek.id,
    weeks,
    reports,
    isEditing,
    isLocked,
    draft.pipeLengths,
  ]);

  const openPipeEditor = () => {
    if (!activeProject || isLocked) return;
    const existing = activeProject.approvedPipes ?? [];
    setPipeSpecsDraft(
      existing.length > 0
        ? existing.map((s) => ({ ...s }))
        : [
            {
              id: `${activeProject.id}-pipe-${Date.now()}-1`,
              label: 'HDPE D110',
              approvedLengthM: 0,
              baselineCompletedM: 0,
            },
          ]
    );
    setIsEditingPipes(true);
    setPipeSaveNotice('');
  };

  const hasWaterPipes = activeProject ? projectHasWaterPipes(activeProject) : false;

  const handleSavePipeSpecs = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || isLocked) return;
    const cleaned = pipeSpecsDraft
      .map((s, idx) => ({
        id: s.id || `${activeProject.id}-pipe-${Date.now()}-${idx + 1}`,
        label: s.label.trim(),
        approvedLengthM: Math.max(0, Number(s.approvedLengthM) || 0),
        baselineCompletedM: Math.max(0, Number(s.baselineCompletedM) || 0),
      }))
      .filter((s) => s.label);

    onUpdateApprovedPipes(activeProject.id, cleaned);
    setDraft((prev) => {
      const nextLengths: Record<string, number> = {};
      for (const spec of cleaned) {
        nextLengths[spec.id] = prev.pipeLengths[spec.id] ?? 0;
      }
      return { ...prev, pipeLengths: nextLengths };
    });
    setIsEditingPipes(false);
    setPipeSaveNotice('Đã lưu danh mục phê duyệt cấp đường ống.');
    setTimeout(() => setPipeSaveNotice(''), 3000);
  };

  const handlePipeLengthChange = (specId: string, rawVal: string) => {
    const val = Math.max(0, Number(rawVal) || 0);
    setDraft((prev) => {
      const nextPipeLengths = { ...prev.pipeLengths, [specId]: val };
      if (!activeProject) {
        return { ...prev, pipeLengths: nextPipeLengths };
      }
      const nextSummary = computeProjectPipeSummary({
        project: activeProject,
        weekId: selectedWeek.id,
        weeks,
        reports,
        draftPipeLengths: nextPipeLengths,
      });
      return {
        ...prev,
        pipeLengths: nextPipeLengths,
        cumulativeProgress: nextSummary.hasApprovedLengths
          ? nextSummary.cumulativePct
          : prev.cumulativeProgress,
        weeklyProgressDelta: nextSummary.hasApprovedLengths
          ? nextSummary.weeklyDeltaPct
          : prev.weeklyProgressDelta,
      };
    });
  };

  const saveWeeklyReport = (relockAfterSave = false) => {
    if (!activeProject || isLocked) return;
    const hasPipes = Boolean(pipeSummary?.hasPipes);
    const hasAutoPct = Boolean(pipeSummary?.hasApprovedLengths);
    const resolvedVolume =
      draft.weeklyVolume.trim() ||
      (hasPipes
        ? pipeSummary?.suggestedVolumeText ||
          'Không phát sinh chiều dài ống trong tuần'
        : '');

    if (!resolvedVolume || !draft.summary.trim()) {
      setErrorMsg(
        'Vui lòng nhập khối lượng tuần này và nội dung báo cáo công việc.'
      );
      return;
    }

    const finalCumulativePct = hasAutoPct
      ? pipeSummary!.cumulativePct
      : Number(draft.cumulativeProgress);
    const finalDeltaPct = hasAutoPct
      ? pipeSummary!.weeklyDeltaPct
      : Number(draft.weeklyProgressDelta);
    const resolvedStage = draft.projectStage.trim() || 'CHƯA THI CÔNG';
    const derivedStatus = mapProjectStageToReportStatus(
      resolvedStage,
      Boolean(draft.issues.trim())
    );

    onSaveWeeklyReport({
      projectId: activeProject.id,
      weekId: selectedWeek.id,
      supervisorId: supervisor.id,
      status: derivedStatus,
      projectStage: resolvedStage,
      cumulativeProgress: finalCumulativePct,
      weeklyProgressDelta: finalDeltaPct,
      weeklyVolume: resolvedVolume,
      summary: draft.summary,
      issues: draft.issues,
      pipeLengths: hasPipes ? draft.pipeLengths : undefined,
    });
    if (relockAfterSave) {
      onLockProjectReport(activeProject.id, !isSettled);
    }
    setErrorMsg('');
    setIsEditing(false);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 3000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveWeeklyReport(false);
  };

  const historyRows = useMemo(() => {
    return weeks
      .map((w) => ({
        week: w,
        report: activeAllProjectReports.find((r) => r.weekId === w.id) ?? null,
      }))
      .reverse();
  }, [weeks, activeAllProjectReports]);

  return (
    <div className="space-y-5">
      {/* Supervisor Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span className="font-semibold text-sky-700">Tab Giám sát riêng</span>
            <span aria-hidden="true">·</span>
            <span>{supervisor.role}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{supervisor.phone}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {supervisor.name}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Chuyên trách: {supervisor.specialty} — Chọn công trình ở danh mục bên trái để nhập hoặc cập nhật báo cáo tuần.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <WeekSelector
            weeks={weeks}
            selectedWeekId={selectedWeekId}
            onChangeWeek={onChangeWeek}
          />
          <button
            type="button"
            disabled={assignedProjects.length === 0}
            onClick={() =>
              exportSupervisorExcel({
                supervisor,
                weeks,
                selectedWeek,
                projects: assignedProjects,
                reports,
              })
            }
            className="h-10 px-3.5 inline-flex items-center gap-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-45 disabled:pointer-events-none rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
            <span>Xuất Excel (.xlsx)</span>
          </button>
          <button
            type="button"
            disabled={assignedProjects.length === 0}
            onClick={() => {
              const model = prepareSupervisorPdfModel({
                supervisor,
                weeks,
                selectedWeek,
                projects: assignedProjects,
                reports,
              });
              setPreviewPdfModel(model);
            }}
            className="h-10 px-3.5 inline-flex items-center gap-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-45 disabled:pointer-events-none rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <FileDown className="w-4 h-4 text-red-700" />
            <span>Xuất PDF</span>
          </button>
        </div>
      </div>

      {/* Supervisor Week Summary Strip */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 bg-white border border-slate-200 rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="p-4">
          <div className="text-xs text-slate-500">Công trình được giao</div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {stats.total}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">
            Đã báo cáo ({selectedWeek.label})
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
            {stats.submitted}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Chờ nộp báo cáo</div>
          <div
            className={`text-xl font-bold font-mono tabular-nums mt-1 ${
              stats.pending > 0 ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            {stats.pending}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Công trình có vướng mắc</div>
          <div
            className={`text-xl font-bold font-mono tabular-nums mt-1 ${
              stats.issues > 0 ? 'text-red-700' : 'text-slate-900'
            }`}
          >
            {stats.issues}
          </div>
        </div>
        <div className="p-4 col-span-2 sm:col-span-1">
          <div className="text-xs text-slate-500">Đánh giá tiến độ cá nhân</div>
          <div className="mt-1 flex items-baseline gap-2 flex-wrap">
            <span
              className={`text-xl font-bold font-mono tabular-nums ${
                supervisorEvaluation.ratingTone === 'emerald'
                  ? 'text-emerald-700'
                  : supervisorEvaluation.ratingTone === 'sky'
                    ? 'text-sky-700'
                    : supervisorEvaluation.ratingTone === 'amber'
                      ? 'text-amber-700'
                      : 'text-red-700'
              }`}
            >
              {supervisorEvaluation.pipeCompletionPct !== null
                ? supervisorEvaluation.pipeCompletionPct
                : supervisorEvaluation.overallCompletionPct}
              %
            </span>
            <span className="text-xs font-semibold text-slate-800">
              · {supervisorEvaluation.ratingLabel}
            </span>
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5 truncate">
            {supervisorEvaluation.totalApprovedM > 0
              ? `Ống: ${formatMeters(supervisorEvaluation.totalCumulativeM)} / ${formatMeters(
                  supervisorEvaluation.totalApprovedM
                )} m`
              : `Bình quân ${supervisorEvaluation.totalProjects} công trình`}
          </div>
        </div>
      </section>

      {/* Empty State vs Master-Detail Split Workspace */}
      {assignedProjects.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
          <h2 className="text-base font-semibold text-slate-900">
            Chưa có công trình nào được phân công cho {supervisor.name}
          </h2>
          <p className="text-sm text-slate-600 max-w-lg mx-auto mt-1.5">
            Khi Lãnh đạo chọn phân công một công trình cho {supervisor.name} ở tab Báo cáo chính, công trình đó sẽ tự động xuất hiện tại đây để giám sát theo dõi theo từng tuần.
          </p>
          <button
            type="button"
            onClick={onBackToLeadership}
            className="mt-4 h-9 px-4 inline-flex items-center gap-2 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Về tab Báo cáo chính để phân công</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* LEFT: Compact Project Directory (Pastel Xanh dương dịu) */}
          <section
            aria-label="Danh mục công trình phụ trách"
            className="lg:col-span-5 xl:col-span-4 bg-sky-50/75 border border-sky-200 rounded-lg overflow-hidden"
          >
            <div className="p-3.5 bg-sky-100/65 border-b border-sky-200 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold text-sky-950">
                  Danh mục công trình ({filteredAssignedProjects.length}/
                  {assignedProjects.length})
                </h2>
                <span className="text-[11px] font-mono text-sky-800/80 tabular-nums">
                  {selectedWeek.label}
                </span>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm mã hoặc tên công trình..."
                  className="w-full h-8 pl-8 pr-2.5 text-xs text-slate-900 bg-white border border-sky-200 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                />
              </div>

              <div className="grid grid-cols-3 gap-1 p-0.5 bg-sky-200/55 rounded-md">
                {(
                  [
                    { id: 'all', label: `Tất cả (${stats.total})` },
                    { id: 'pending', label: `Chờ nộp (${stats.pending})` },
                    { id: 'submitted', label: `Đã nộp (${stats.submitted})` },
                  ] as { id: ListFilter; label: string }[]
                ).map((item) => {
                  const active = listFilter === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setListFilter(item.id)}
                      className={`py-1 px-1.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap truncate ${
                        active
                          ? 'bg-white text-sky-950 shadow-xs'
                          : 'text-sky-900/75 hover:text-sky-950'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="divide-y divide-sky-200/75 max-h-[600px] overflow-y-auto">
              {orderedFilteredProjects.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  Không có công trình nào khớp bộ lọc.
                </div>
              ) : (
                groupedAssignedProjects.map((section) => (
                  <Fragment key={section.capitalGroup}>
                    {/* Compact Capital Group Divider */}
                    <div className="px-3.5 py-2 bg-sky-100/80 border-y border-sky-200 first:border-t-0 flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-800 truncate">
                        <Layers className="w-3 h-3 text-sky-700 shrink-0" />
                        <span className="truncate">{section.capitalGroup}</span>
                      </span>
                      <span className="text-[11px] font-mono tabular-nums text-slate-600 shrink-0">
                        {section.totalCount}
                      </span>
                    </div>

                    {section.areas.map((area) => {
                      const showAreaHeader = shouldRenderAreaSubDivider(
                        section.capitalGroup,
                        area.areaGroup
                      );
                      return (
                        <Fragment
                          key={`${section.capitalGroup}__${area.areaGroup}`}
                        >
                          {showAreaHeader && (
                            <div className="px-3.5 py-1.5 bg-sky-100/45 border-b border-sky-200/75 flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-900 truncate">
                                <MapPin className="w-3 h-3 text-sky-700 shrink-0" />
                                <span className="truncate">{area.areaGroup}</span>
                              </span>
                              <span className="text-[10px] font-mono tabular-nums text-sky-800/70 shrink-0">
                                {area.projects.length}
                              </span>
                            </div>
                          )}

                          {area.projects.map((project) => {
                            const repEntry = reportByProjectForWeek.get(project.id);
                            const rep = repEntry?.report;
                            const projLocked = isProjectReportLocked(project);
                            const projSettled = isProjectSettled(project);
                            const isSelected = activeProject?.id === project.id;

                            return (
                              <button
                                key={project.id}
                                type="button"
                                onClick={() => setSelectedProjectId(project.id)}
                                className={`w-full text-left px-3.5 py-2.5 transition-colors flex flex-col gap-1 ${
                                  isSelected
                                    ? 'bg-white ring-1 ring-inset ring-sky-400/80'
                                    : 'bg-sky-50/40 hover:bg-sky-100/55'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2 w-full">
                                  <span
                                    className={`text-[11px] font-mono font-semibold ${
                                      isSelected ? 'text-sky-800' : 'text-sky-700'
                                    }`}
                                  >
                                    {project.code}
                                  </span>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {projLocked ? (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600">
                                        <Lock className="w-3 h-3 text-slate-500" />
                                        <span>Đã chốt</span>
                                      </span>
                                    ) : projSettled ? (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
                                        <Unlock className="w-3 h-3" />
                                        <span>Mở sửa</span>
                                      </span>
                                    ) : (
                                      <StatusIndicator
                                        status={rep ? rep.status : 'missing'}
                                      />
                                    )}
                                    {(rep || projectPipePctMap.has(project.id)) && (
                                      <span className="text-[11px] font-mono font-semibold tabular-nums text-slate-700">
                                        {projectPipePctMap.get(project.id) ??
                                          rep?.cumulativeProgress ??
                                          0}
                                        %
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div
                                  className={`text-xs font-semibold leading-snug line-clamp-2 ${
                                    isSelected ? 'text-slate-950' : 'text-slate-800'
                                  }`}
                                >
                                  {project.name}
                                </div>

                                <div className="text-[11px] text-slate-500 truncate">
                                  {project.location} · {project.category}
                                </div>
                              </button>
                            );
                          })}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                ))
              )}
            </div>
          </section>

          {/* RIGHT: Dedicated Report Input & Review Area (Pastel Oải hương / Xanh tím dịu) */}
          <section
            aria-label="Khu vực nhập báo cáo tuần"
            className="lg:col-span-7 xl:col-span-8 bg-indigo-50/55 border border-indigo-200 rounded-lg overflow-hidden"
          >
            {activeProject ? (
              <>
                {/* Selected Project Header + Quick Prev/Next Project Stepper */}
                <div className="px-5 py-4 bg-indigo-100/55 border-b border-indigo-200 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mb-1">
                      <span className="font-mono font-semibold text-indigo-800">
                        {activeProject.code}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{activeProject.capitalGroup}</span>
                      <span aria-hidden="true">·</span>
                      <span>{activeProject.areaGroup}</span>
                      <span aria-hidden="true">·</span>
                      <span>{activeProject.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        Tiến độ: {activeProject.targetEndDate}
                      </span>
                    </div>
                    <h2 className="text-base font-bold text-slate-900 leading-snug">
                      {activeProject.name}
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Lũy kế / Quy mô: {activeProject.totalPlannedVolume}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {orderedFilteredProjects.length > 1 && (
                      <div className="inline-flex items-center border border-indigo-200 rounded-md bg-white">
                        <button
                          type="button"
                          disabled={activeIndexInFiltered <= 0}
                          onClick={() =>
                            activeIndexInFiltered > 0 &&
                            setSelectedProjectId(
                              orderedFilteredProjects[
                                activeIndexInFiltered - 1
                              ].id
                            )
                          }
                          aria-label="Công trình trước"
                          className="h-8 w-8 inline-flex items-center justify-center text-slate-600 hover:text-slate-900 disabled:opacity-35 disabled:pointer-events-none"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="px-1.5 text-[11px] font-mono tabular-nums text-slate-600">
                          {activeIndexInFiltered >= 0
                            ? `${activeIndexInFiltered + 1}/${orderedFilteredProjects.length}`
                            : ''}
                        </span>
                        <button
                          type="button"
                          disabled={
                            activeIndexInFiltered < 0 ||
                            activeIndexInFiltered >=
                              orderedFilteredProjects.length - 1
                          }
                          onClick={() =>
                            activeIndexInFiltered <
                              orderedFilteredProjects.length - 1 &&
                            setSelectedProjectId(
                              orderedFilteredProjects[
                                activeIndexInFiltered + 1
                              ].id
                            )
                          }
                          aria-label="Công trình tiếp theo"
                          className="h-8 w-8 inline-flex items-center justify-center text-slate-600 hover:text-slate-900 disabled:opacity-35 disabled:pointer-events-none"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowHistory((v) => !v)}
                      className="h-8 px-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-indigo-50 border border-indigo-200 rounded-md transition-colors whitespace-nowrap"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>Lịch sử</span>
                      {showHistory ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Settled Report Lock / Reopen Banner */}
                {isLocked ? (
                  <div className="px-5 py-3 bg-slate-100/90 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <Lock className="w-4 h-4 text-slate-700 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900">
                          Đã chốt báo cáo — Công trình đã quyết toán
                          {activeProject.reportLockedAt ? (
                            <span className="font-mono font-normal text-slate-500 ml-2 tabular-nums">
                              ({activeProject.reportLockedAt})
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          Số liệu báo cáo và cấp đường ống đang được khóa. Chỉ cập nhật được khi mở lại chỉnh sửa.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onReopenProjectReport(activeProject.id);
                        setIsEditing(true);
                      }}
                      className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-semibold text-sky-800 bg-white border border-slate-300 hover:border-sky-400 hover:bg-sky-50 rounded-md transition-colors whitespace-nowrap shrink-0"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      <span>Mở lại chỉnh sửa</span>
                    </button>
                  </div>
                ) : (
                  isSettled && (
                    <div className="px-5 py-3 bg-amber-50/80 border-b border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <Unlock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-amber-950">
                            Đang mở lại chỉnh sửa báo cáo quyết toán
                            {activeProject.reportReopenedAt ? (
                              <span className="font-mono font-normal text-amber-800 ml-2 tabular-nums">
                                (Mở lúc {activeProject.reportReopenedAt})
                              </span>
                            ) : null}
                          </div>
                          <p className="text-[11px] text-amber-800 mt-0.5">
                            Sau khi điều chỉnh xong khối lượng ống hoặc báo cáo tuần, bấm Chốt lại báo cáo để khóa hồ sơ.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onLockProjectReport(activeProject.id, false);
                          setIsEditing(false);
                          setIsEditingPipes(false);
                        }}
                        className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>Chốt lại báo cáo</span>
                      </button>
                    </div>
                  )
                )}

                {/* Approved Pipes Approval & Cumulative Ledger (for all projects with water pipes) */}
                {hasWaterPipes && (
                  <div className="px-5 py-4 bg-indigo-50/40 border-b border-indigo-200/80 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                          <Ruler className="w-3.5 h-3.5 text-indigo-700 shrink-0" />
                          <span>Phê duyệt các cấp đường ống &amp; chiều dài (m)</span>
                        </div>
                        <p className="text-[11px] font-mono tabular-nums text-slate-600 mt-0.5">
                          {pipeSummary?.hasPipes
                            ? pipeSummary.hasApprovedLengths
                              ? `Tổng phê duyệt: ${formatMeters(
                                  pipeSummary.totalApprovedM
                                )} m · Lũy kế đến ${selectedWeek.label}: ${formatMeters(
                                  pipeSummary.totalCumulativeM
                                )} m (${pipeSummary.cumulativePct}%)`
                              : `Đã nhận diện ${pipeSummary.rows.length} cấp ống · Lũy kế đã làm: ${formatMeters(
                                  pipeSummary.totalCumulativeM
                                )} m${
                                  isLocked
                                    ? ''
                                    : ' · Hãy nhập chiều dài phê duyệt (m) để tự động tính %'
                                }`
                            : 'Chưa thiết lập cấp đường ống phê duyệt — Hãy nhập để theo dõi chiều dài và tự động tính % lũy kế từng tuần.'}
                        </p>
                      </div>

                      {isLocked ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 whitespace-nowrap shrink-0">
                          <Lock className="w-3 h-3" />
                          <span>Đã khóa sửa</span>
                        </span>
                      ) : (
                        !isEditingPipes && (
                          <button
                            type="button"
                            onClick={openPipeEditor}
                            className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 hover:text-sky-900 bg-white border border-slate-200 hover:border-sky-300 rounded-md transition-colors whitespace-nowrap shrink-0"
                          >
                            {pipeSummary?.hasPipes ? (
                              <>
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>Chỉnh sửa phê duyệt ống</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-3.5 h-3.5" />
                                <span>Nhập cấp ống phê duyệt</span>
                              </>
                            )}
                          </button>
                        )
                      )}
                    </div>

                    {pipeSaveNotice && (
                      <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-md text-xs font-medium text-emerald-800">
                        {pipeSaveNotice}
                      </div>
                    )}

                    {isEditingPipes ? (
                      <form onSubmit={handleSavePipeSpecs} className="space-y-2.5">
                        <datalist id="pipe-grade-presets-supervisor">
                          {PIPE_GRADE_PRESETS.map((preset) => (
                            <option key={preset} value={preset} />
                          ))}
                        </datalist>
                        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs min-w-[520px]">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                                <th className="py-2 px-3">Cấp đường ống</th>
                                <th className="py-2 px-3 text-right w-36">
                                  Phê duyệt (m)
                                </th>
                                <th className="py-2 px-3 text-right w-36">
                                  Lũy kế đầu kỳ (m)
                                </th>
                                <th className="py-2 px-2 w-10 text-center">Xóa</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {pipeSpecsDraft.map((spec, idx) => (
                                <tr key={spec.id || idx}>
                                  <td className="py-2 px-3">
                                    <input
                                      type="text"
                                      list="pipe-grade-presets-supervisor"
                                      value={spec.label}
                                      onChange={(e) =>
                                        setPipeSpecsDraft((rows) =>
                                          rows.map((r, i) =>
                                            i === idx
                                              ? { ...r, label: e.target.value }
                                              : r
                                          )
                                        )
                                      }
                                      placeholder="Ví dụ: HDPE D225 hoặc HM1 - D63"
                                      className="w-full h-8 px-2.5 text-xs text-slate-900 bg-white border border-slate-300 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                                    />
                                  </td>
                                  <td className="py-2 px-3">
                                    <input
                                      type="number"
                                      min={0}
                                      step="0.1"
                                      value={spec.approvedLengthM}
                                      onChange={(e) =>
                                        setPipeSpecsDraft((rows) =>
                                          rows.map((r, i) =>
                                            i === idx
                                              ? {
                                                  ...r,
                                                  approvedLengthM:
                                                    Number(e.target.value) || 0,
                                                }
                                              : r
                                          )
                                        )
                                      }
                                      className="w-full h-8 px-2.5 text-right text-xs font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                                    />
                                  </td>
                                  <td className="py-2 px-3">
                                    <input
                                      type="number"
                                      min={0}
                                      step="0.1"
                                      value={spec.baselineCompletedM ?? 0}
                                      onChange={(e) =>
                                        setPipeSpecsDraft((rows) =>
                                          rows.map((r, i) =>
                                            i === idx
                                              ? {
                                                  ...r,
                                                  baselineCompletedM:
                                                    Number(e.target.value) || 0,
                                                }
                                              : r
                                          )
                                        )
                                      }
                                      className="w-full h-8 px-2.5 text-right text-xs font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                                    />
                                  </td>
                                  <td className="py-2 px-2 text-center">
                                    <button
                                      type="button"
                                      aria-label="Xóa cấp ống"
                                      onClick={() =>
                                        setPipeSpecsDraft((rows) =>
                                          rows.filter((_, i) => i !== idx)
                                        )
                                      }
                                      className="h-7 w-7 inline-flex items-center justify-center text-slate-400 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setPipeSpecsDraft((rows) => [
                                ...rows,
                                {
                                  id: `${activeProject.id}-pipe-${Date.now()}-${
                                    rows.length + 1
                                  }`,
                                  label: '',
                                  approvedLengthM: 0,
                                  baselineCompletedM: 0,
                                },
                              ])
                            }
                            className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md whitespace-nowrap"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Thêm cấp ống</span>
                          </button>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setIsEditingPipes(false)}
                              className="h-8 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md whitespace-nowrap"
                            >
                              Hủy
                            </button>
                            <button
                              type="submit"
                              className="h-8 px-3.5 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-md whitespace-nowrap"
                            >
                              Lưu phê duyệt ống
                            </button>
                          </div>
                        </div>
                      </form>
                    ) : (
                      pipeSummary?.hasPipes && (
                        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs min-w-[540px]">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                                <th className="py-2 px-3">Cấp đường ống</th>
                                <th className="py-2 px-3 text-right">
                                  Phê duyệt (m)
                                </th>
                                <th className="py-2 px-3 text-right">
                                  Lũy kế trước (m)
                                </th>
                                <th className="py-2 px-3 text-right">
                                  Tuần này (m)
                                </th>
                                <th className="py-2 px-3 text-right">
                                  Lũy kế (m)
                                </th>
                                <th className="py-2 px-3 text-right">
                                  Hoàn thành
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {pipeSummary.rows.map((row) => (
                                <tr key={row.spec.id}>
                                  <td className="py-1.5 px-3 font-medium text-slate-900">
                                    {row.spec.label}
                                  </td>
                                  <td className="py-1.5 px-3 text-right font-mono tabular-nums text-slate-700">
                                    {row.spec.approvedLengthM > 0
                                      ? formatMeters(row.spec.approvedLengthM)
                                      : 'Chưa nhập'}
                                  </td>
                                  <td className="py-1.5 px-3 text-right font-mono tabular-nums text-slate-600">
                                    {formatMeters(row.priorM)}
                                  </td>
                                  <td className="py-1.5 px-3 text-right font-mono tabular-nums text-sky-700 font-medium">
                                    {row.weekM > 0
                                      ? `+${formatMeters(row.weekM)}`
                                      : '0'}
                                  </td>
                                  <td className="py-1.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                                    {formatMeters(row.cumulativeM)}
                                  </td>
                                  <td className="py-1.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                                    {row.spec.approvedLengthM > 0
                                      ? `${row.pct}%`
                                      : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="bg-slate-50 border-t border-slate-200 font-semibold text-slate-900">
                                <td className="py-2 px-3">Tổng tuyến ống</td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums">
                                  {pipeSummary.hasApprovedLengths
                                    ? formatMeters(pipeSummary.totalApprovedM)
                                    : 'Chưa nhập'}
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700">
                                  {formatMeters(pipeSummary.totalPriorM)}
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums text-sky-700">
                                  {pipeSummary.totalWeekM > 0
                                    ? `+${formatMeters(pipeSummary.totalWeekM)}`
                                    : '0'}
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums">
                                  {formatMeters(pipeSummary.totalCumulativeM)}
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums text-sky-700">
                                  {pipeSummary.hasApprovedLengths
                                    ? `${pipeSummary.cumulativePct}%`
                                    : '—'}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )
                    )}
                  </div>
                )}

                {/* Report Area Body */}
                <div className="p-5 bg-indigo-50/25">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-4 border-b border-indigo-200/70">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-semibold text-slate-800">
                        Báo cáo {selectedWeek.label} ({selectedWeek.dateRange})
                      </span>
                      <StatusIndicator
                        status={currentReport ? currentReport.status : 'missing'}
                      />
                    </div>
                    {!isLocked && !isEditing && (
                      <div className="flex items-center gap-2">
                        {currentReport && (
                          <button
                            type="button"
                            onClick={() => setIsEditing(true)}
                            className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 hover:text-sky-900 bg-sky-50 hover:bg-sky-100 rounded-md transition-colors whitespace-nowrap"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Cập nhật báo cáo</span>
                          </button>
                        )}
                        {!isSettled &&
                          (currentReport?.cumulativeProgress === 100 ||
                            activeProject.targetEndDate
                              .toUpperCase()
                              .includes('QT') ||
                            activeProject.targetEndDate
                              .toUpperCase()
                              .includes('QUYẾT TOÁN')) && (
                            <button
                              type="button"
                              onClick={() =>
                                onLockProjectReport(activeProject.id, true)
                              }
                              className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap"
                            >
                              <Lock className="w-3.5 h-3.5" />
                              <span>Chốt quyết toán</span>
                            </button>
                          )}
                      </div>
                    )}
                  </div>

                  {justSaved && (
                    <div className="mb-4 px-3.5 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-medium text-emerald-800">
                      Đã lưu báo cáo {selectedWeek.label} — Dữ liệu đã đồng bộ lên tab Báo cáo chính của Lãnh đạo.
                    </div>
                  )}

                  {isEditing && !isLocked ? (
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-600">
                          {currentReport
                            ? `Chỉnh sửa nội dung đã nộp (${currentReport.submittedAt})`
                            : 'Nhập thông tin báo cáo mới cho tuần này'}
                        </span>
                        {latestPreviousReport && !currentReport && (
                          <span className="text-xs text-slate-500 font-mono tabular-nums">
                            Lũy kế tuần trước:{' '}
                            {latestPreviousReport.cumulativeProgress}%
                          </span>
                        )}
                      </div>

                      {hasWaterPipes && (
                        <div className="border border-sky-200 bg-sky-50/40 rounded-lg p-3.5 space-y-2.5">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-900">
                              Phiếu nhập chiều dài ống làm được trong {selectedWeek.label} (m)
                            </span>
                            {pipeSummary?.hasPipes && (
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="text-xs font-mono tabular-nums font-semibold text-sky-800">
                                  {pipeSummary.hasApprovedLengths
                                    ? `Lũy kế mới: ${formatMeters(
                                        pipeSummary.totalCumulativeM
                                      )} / ${formatMeters(
                                        pipeSummary.totalApprovedM
                                      )} m (${pipeSummary.cumulativePct}%)`
                                    : `Lũy kế đã làm: ${formatMeters(
                                        pipeSummary.totalCumulativeM
                                      )} m`}
                                </span>
                                {!pipeSummary.hasApprovedLengths && (
                                  <button
                                    type="button"
                                    onClick={openPipeEditor}
                                    className="text-[11px] font-semibold text-sky-700 hover:text-sky-900 hover:underline whitespace-nowrap"
                                  >
                                    Nhập chiều dài phê duyệt (m)
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {pipeSummary?.hasPipes ? (
                            <div className="bg-white border border-slate-200 rounded-md overflow-x-auto">
                              <table className="w-full text-left border-collapse text-xs min-w-[520px]">
                                <thead>
                                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                                    <th className="py-2 px-3">Cấp đường ống</th>
                                    <th className="py-2 px-3 text-right">
                                      Phê duyệt (m)
                                    </th>
                                    <th className="py-2 px-3 text-right">
                                      Lũy kế trước (m)
                                    </th>
                                    <th className="py-2 px-3 text-right w-36">
                                      Làm tuần này (m)
                                    </th>
                                    <th className="py-2 px-3 text-right">
                                      Lũy kế mới (m)
                                    </th>
                                    <th className="py-2 px-3 text-right">%</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                  {pipeSummary.rows.map((row) => (
                                    <tr key={row.spec.id}>
                                      <td className="py-2 px-3 font-medium text-slate-900">
                                        {row.spec.label}
                                      </td>
                                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700">
                                        {row.spec.approvedLengthM > 0
                                          ? formatMeters(row.spec.approvedLengthM)
                                          : 'Chưa nhập'}
                                      </td>
                                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600">
                                        {formatMeters(row.priorM)}
                                      </td>
                                      <td className="py-1.5 px-3">
                                        <input
                                          type="number"
                                          min={0}
                                          step="0.1"
                                          aria-label={`Chiều dài ${row.spec.label} làm trong tuần`}
                                          value={draft.pipeLengths[row.spec.id] ?? 0}
                                          onChange={(e) =>
                                            handlePipeLengthChange(
                                              row.spec.id,
                                              e.target.value
                                            )
                                          }
                                          className="w-full h-8 px-2.5 text-right text-xs font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                                        />
                                      </td>
                                      <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                                        {formatMeters(row.cumulativeM)}
                                      </td>
                                      <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-sky-700">
                                        {row.spec.approvedLengthM > 0
                                          ? `${row.pct}%`
                                          : '—'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="bg-white border border-slate-200 rounded-md p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <span className="text-xs text-slate-600">
                                Chưa có dòng cấp đường ống nào. Hãy thêm cấp đường ống để nhập chiều dài thực hiện tuần này.
                              </span>
                              <button
                                type="button"
                                onClick={openPipeEditor}
                                className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-md whitespace-nowrap shrink-0"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Thêm cấp đường ống</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label
                            htmlFor="supervisor-project-stage-select"
                            className="block text-xs font-medium text-slate-700"
                          >
                            Trạng thái công trình
                          </label>
                          <span className="text-[11px] text-slate-500">
                            {inheritedStageInfo?.source === 'previous_week'
                              ? `Tự gối từ ${inheritedStageInfo.sourceWeekLabel} — giữ nguyên hoặc điều chỉnh`
                              : inheritedStageInfo?.source === 'current_week'
                                ? `Đã lưu ở ${selectedWeek.label}`
                                : 'Theo trạng thái hiện có của công trình'}
                          </span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                          <select
                            id="supervisor-project-stage-select"
                            value={draft.projectStage}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                projectStage: e.target.value,
                              }))
                            }
                            className={`w-full sm:max-w-md h-9 px-3 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 ${getProjectStageToneClass(
                              draft.projectStage
                            )}`}
                          >
                            {!PROJECT_STAGE_OPTIONS.some(
                              (opt) => opt.value === draft.projectStage
                            ) &&
                              draft.projectStage && (
                                <option value={draft.projectStage}>
                                  {draft.projectStage} (Từ kỳ trước)
                                </option>
                              )}
                            {PROJECT_STAGE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>

                          {pipeSummary?.hasApprovedLengths && (
                            <span className="text-xs font-mono tabular-nums text-sky-800 whitespace-nowrap">
                              Tiến độ ống tự tính: {pipeSummary.cumulativePct}% (
                              {pipeSummary.weeklyDeltaPct > 0
                                ? `+${pipeSummary.weeklyDeltaPct}% tuần`
                                : '+0% tuần'}
                              )
                            </span>
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <label className="block text-xs font-medium text-slate-700">
                            Khối lượng thực hiện trong tuần
                          </label>
                          {pipeSummary?.hasPipes &&
                            pipeSummary.suggestedVolumeText && (
                              <button
                                type="button"
                                onClick={() =>
                                  setDraft((d) => ({
                                    ...d,
                                    weeklyVolume:
                                      pipeSummary.suggestedVolumeText,
                                  }))
                                }
                                className="text-[11px] font-medium text-sky-700 hover:text-sky-900 hover:underline whitespace-nowrap"
                              >
                                Điền từ bảng ống
                              </button>
                            )}
                        </div>
                        <input
                          type="text"
                          value={draft.weeklyVolume}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              weeklyVolume: e.target.value,
                            }))
                          }
                          placeholder={
                            pipeSummary?.hasPipes
                              ? 'Để trống để tự động tổng hợp từ bảng ống, hoặc nhập ghi chú chi tiết...'
                              : 'Ví dụ: 320 m ống HDPE D300, thử áp đạt 6 bar, lắp 2 hố van...'
                          }
                          className="w-full h-9 px-3 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Nội dung công việc chính tuần này
                        </label>
                        <textarea
                          rows={3}
                          value={draft.summary}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, summary: e.target.value }))
                          }
                          placeholder="Mô tả ngắn gọn công việc đã hoàn thành, công tác kiểm tra kỹ thuật..."
                          className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Vướng mắc & Đề xuất lãnh đạo (nếu có)
                        </label>
                        <textarea
                          rows={2}
                          value={draft.issues}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, issues: e.target.value }))
                          }
                          placeholder="Mặt bằng, hạ tầng ngầm, vật tư, thời tiết... (để trống nếu bình thường)"
                          className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                        />
                      </div>

                      {errorMsg && (
                        <p className="text-xs font-medium text-red-700">
                          {errorMsg}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
                        {currentReport && (
                          <button
                            type="button"
                            onClick={() => {
                              setDraft(buildInitialDraft());
                              setIsEditing(false);
                              setErrorMsg('');
                            }}
                            className="h-9 px-4 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
                          >
                            Hủy
                          </button>
                        )}
                        {isSettled && (
                          <button
                            type="button"
                            onClick={() => saveWeeklyReport(true)}
                            className="h-9 px-4 inline-flex items-center gap-2 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors whitespace-nowrap"
                          >
                            <Lock className="w-3.5 h-3.5" />
                            <span>Lưu &amp; Chốt lại báo cáo</span>
                          </button>
                        )}
                        <button
                          type="submit"
                          className="h-9 px-4 inline-flex items-center gap-2 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors whitespace-nowrap"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Lưu &amp; Gửi báo cáo tuần</span>
                        </button>
                      </div>
                    </form>
                  ) : currentReport ? (
                    <div className="space-y-4">
                      {isCarriedSettled && settledFromWeekLabel && (
                        <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-600">
                          Số liệu quyết toán đã được chốt từ{' '}
                          <span className="font-semibold text-slate-800">
                            {settledFromWeekLabel}
                          </span>
                          .
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-4 border-b border-slate-100">
                        <div>
                          <div className="text-xs text-slate-500">
                            Trạng thái công trình
                          </div>
                          <div
                            className={`text-sm font-bold mt-0.5 ${getProjectStageToneClass(
                              currentReport.projectStage ||
                                inheritedStageInfo?.stage ||
                                activeProject.targetEndDate
                            )}`}
                          >
                            {currentReport.projectStage ||
                              inheritedStageInfo?.stage ||
                              activeProject.targetEndDate}
                          </div>
                        </div>
                        {pipeSummary?.hasApprovedLengths && (
                          <div>
                            <div className="text-xs text-slate-500">
                              Tiến độ tuyến ống
                            </div>
                            <div className="text-sm font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                              {pipeSummary.cumulativePct}%
                              <span className="ml-1.5 text-xs font-medium text-sky-700">
                                (+{pipeSummary.weeklyDeltaPct}% tuần)
                              </span>
                            </div>
                          </div>
                        )}
                        <div
                          className={
                            pipeSummary?.hasApprovedLengths
                              ? 'sm:col-span-1'
                              : 'sm:col-span-2'
                          }
                        >
                          <div className="text-xs text-slate-500">
                            Khối lượng tuần ({selectedWeek.label})
                          </div>
                          <div className="text-sm font-medium text-slate-900 mt-0.5">
                            {currentReport.weeklyVolume}
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-slate-500 mb-1">
                          Nội dung công việc chính
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed">
                          {currentReport.summary}
                        </p>
                      </div>

                      {currentReport.issues && (
                        <div className="p-3 bg-red-50/70 border border-red-200 rounded-lg">
                          <div className="text-xs font-semibold text-red-800 mb-0.5">
                            Vướng mắc đang báo cáo
                          </div>
                          <p className="text-sm text-red-900">
                            {currentReport.issues}
                          </p>
                        </div>
                      )}

                      {currentReport.leaderNote && (
                        <div className="p-3 bg-sky-50/70 border border-sky-200 rounded-lg flex items-start gap-2.5">
                          <MessageSquareText className="w-4 h-4 text-sky-700 mt-0.5 shrink-0" />
                          <div>
                            <div className="text-xs font-semibold text-sky-900 mb-0.5">
                              Chỉ đạo của Lãnh đạo
                            </div>
                            <p className="text-sm text-sky-950">
                              {currentReport.leaderNote}
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                        Cập nhật lần cuối: {currentReport.submittedAt}
                      </div>
                    </div>
                  ) : (
                    <div className="p-5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="text-xs text-slate-600 leading-relaxed">
                        Công trình đã quyết toán và chốt báo cáo. Không phát sinh báo cáo mới trong{' '}
                        <span className="font-semibold text-slate-800">
                          {selectedWeek.label}
                        </span>
                        .
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onReopenProjectReport(activeProject.id);
                          setIsEditing(true);
                        }}
                        className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-semibold text-sky-800 bg-white border border-slate-300 hover:border-sky-400 hover:bg-sky-50 rounded-md whitespace-nowrap shrink-0"
                      >
                        <Unlock className="w-3.5 h-3.5" />
                        <span>Mở lại chỉnh sửa</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Expandable Multi-Week History for Selected Project */}
                {showHistory && (
                  <div className="px-5 py-4 bg-indigo-100/40 border-t border-indigo-200">
                    <div className="text-xs font-semibold text-slate-700 mb-2.5">
                      Lịch sử báo cáo qua các tuần — {activeProject.code}
                    </div>
                    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                            <th className="py-2 px-3">Tuần</th>
                            <th className="py-2 px-3">Trạng thái công trình</th>
                            <th className="py-2 px-3 text-right">Lũy kế</th>
                            <th className="py-2 px-3 text-right">Tăng tuần</th>
                            <th className="py-2 px-3">Khối lượng tuần</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {historyRows.map(({ week, report }) => (
                            <tr
                              key={week.id}
                              className={
                                week.id === selectedWeek.id ? 'bg-sky-50/50' : ''
                              }
                            >
                              <td className="py-2 px-3 font-mono font-medium text-slate-800 whitespace-nowrap">
                                {week.label}
                              </td>
                              <td className="py-2 px-3">
                                {report?.projectStage ? (
                                  <span
                                    className={`text-xs font-semibold whitespace-nowrap ${getProjectStageToneClass(
                                      report.projectStage
                                    )}`}
                                  >
                                    {report.projectStage}
                                  </span>
                                ) : (
                                  <StatusIndicator
                                    status={report ? report.status : 'missing'}
                                  />
                                )}
                              </td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                                {report ? `${report.cumulativeProgress}%` : '—'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums text-sky-700">
                                {report
                                  ? `+${report.weeklyProgressDelta}%`
                                  : '—'}
                              </td>
                              <td className="py-2 px-3 text-slate-600">
                                {report ? report.weeklyVolume : 'Chưa nộp'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="p-10 text-center text-sm text-slate-500">
                Chọn một công trình ở danh mục bên trái để nhập hoặc xem báo cáo tuần.
              </div>
            )}
          </section>
        </div>
      )}

      <PdfPreviewModal
        isOpen={previewPdfModel !== null}
        model={previewPdfModel}
        onClose={() => setPreviewPdfModel(null)}
      />
    </div>
  );
}
