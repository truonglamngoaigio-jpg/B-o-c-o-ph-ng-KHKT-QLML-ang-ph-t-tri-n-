import { useEffect, useMemo, useState } from 'react';
import {
  X,
  ArrowUpRight,
  MessageSquareText,
  Edit3,
  Plus,
  Ruler,
  Trash2,
  Lock,
  Unlock,
} from 'lucide-react';
import {
  PipeSpec,
  Supervisor,
  WaterProject,
  WeekPeriod,
  WeeklyReport,
} from '../types';
import {
  PIPE_GRADE_PRESETS,
  computeProjectPipeSummary,
  formatMeters,
  projectHasWaterPipes,
} from '../utils/pipeProgress';
import {
  isProjectReportLocked,
  isProjectSettled,
  resolveEffectiveReportForWeek,
} from '../utils/projectLock';
import {
  getProjectStageToneClass,
  resolveInheritedProjectStage,
} from '../utils/projectStage';
import { StatusIndicator } from './StatusIndicator';

interface ProjectDetailDrawerProps {
  project: WaterProject | null;
  selectedWeek: WeekPeriod;
  weeks: WeekPeriod[];
  supervisors: Supervisor[];
  reports: WeeklyReport[];
  capitalOptions: string[];
  areaOptions: string[];
  onClose: () => void;
  onAssignSupervisor: (projectId: string, supervisorId: string | null) => void;
  onUpdateProjectGroup: (
    projectId: string,
    capitalGroup: string,
    areaGroup: string
  ) => void;
  onUpdateLeaderNote: (
    projectId: string,
    weekId: string,
    leaderNote: string
  ) => void;
  onUpdateApprovedPipes?: (projectId: string, approvedPipes: PipeSpec[]) => void;
  onReopenProjectReport: (projectId: string) => void;
  onLockProjectReport: (projectId: string, markSettled?: boolean) => void;
  onJumpToSupervisorTab: (supervisorId: string) => void;
}

export function ProjectDetailDrawer({
  project,
  selectedWeek,
  weeks,
  supervisors,
  reports,
  capitalOptions,
  areaOptions,
  onClose,
  onAssignSupervisor,
  onUpdateProjectGroup,
  onUpdateLeaderNote,
  onUpdateApprovedPipes,
  onReopenProjectReport,
  onLockProjectReport,
  onJumpToSupervisorTab,
}: ProjectDetailDrawerProps) {
  const effectiveReport = useMemo(() => {
    if (!project) {
      return { report: null, isCarriedSettled: false };
    }
    return resolveEffectiveReportForWeek({
      project,
      weekId: selectedWeek.id,
      weeks,
      reports,
    });
  }, [project, selectedWeek.id, weeks, reports]);

  const currentReport = effectiveReport.report;
  const isCarriedSettled = effectiveReport.isCarriedSettled;
  const settledFromWeekLabel = effectiveReport.settledFromWeekLabel;

  const isLocked = project ? isProjectReportLocked(project) : false;
  const isSettled = project ? isProjectSettled(project) : false;

  const [noteDraft, setNoteDraft] = useState(currentReport?.leaderNote ?? '');
  const [noteSavedFeedback, setNoteSavedFeedback] = useState(false);
  const [isEditingPipes, setIsEditingPipes] = useState(false);
  const [pipeSpecsDraft, setPipeSpecsDraft] = useState<PipeSpec[]>([]);

  const pipeSummary = useMemo(() => {
    if (!project) return null;
    return computeProjectPipeSummary({
      project,
      weekId: selectedWeek.id,
      weeks,
      reports,
    });
  }, [project, selectedWeek.id, weeks, reports]);

  useEffect(() => {
    setNoteDraft(currentReport?.leaderNote ?? '');
    setNoteSavedFeedback(false);
    setIsEditingPipes(false);
  }, [project?.id, selectedWeek.id, currentReport?.leaderNote, isLocked]);

  if (!project) return null;

  const assignedSupervisor = supervisors.find(
    (s) => s.id === project.supervisorId
  );

  const projectHistory = weeks
    .map((week) => ({
      week,
      report: reports.find(
        (r) => r.projectId === project.id && r.weekId === week.id
      ),
    }))
    .reverse();

  const handleSaveNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentReport || isLocked) return;
    onUpdateLeaderNote(project.id, currentReport.weekId, noteDraft);
    setNoteSavedFeedback(true);
    setTimeout(() => setNoteSavedFeedback(false), 2500);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label={`Chi tiết công trình ${project.name}`}
    >
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <aside className="relative z-10 w-full max-w-2xl bg-white h-full border-l border-slate-200 flex flex-col shadow-xl">
        {/* Drawer Header */}
        <div className="px-6 py-5 border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-1">
              <span className="font-mono font-medium text-sky-700">
                {project.code}
              </span>
              <span aria-hidden="true">·</span>
              <span>{project.capitalGroup}</span>
              <span aria-hidden="true">·</span>
              <span>{project.areaGroup}</span>
              <span aria-hidden="true">·</span>
              <span>{project.category}</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 leading-snug">
              {project.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng chi tiết"
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Trạng thái Chốt / Mở lại chỉnh sửa */}
          {isLocked ? (
            <div className="p-3.5 bg-slate-100 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <Lock className="w-4 h-4 text-slate-700 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-900">
                    Báo cáo đã chốt (Công trình ĐÃ QUYẾT TOÁN)
                    {project.reportLockedAt ? (
                      <span className="font-mono font-normal text-slate-500 ml-1.5 tabular-nums">
                        · {project.reportLockedAt}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Toàn bộ thông số, phân công và báo cáo tuần đang được khóa.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onReopenProjectReport(project.id)}
                className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-semibold text-sky-800 bg-white border border-slate-300 hover:border-sky-400 hover:bg-sky-50 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>Mở lại chỉnh sửa</span>
              </button>
            </div>
          ) : isSettled ? (
            <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <Unlock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-amber-950">
                    Đang mở lại chỉnh sửa báo cáo quyết toán
                    {project.reportReopenedAt ? (
                      <span className="font-mono font-normal text-amber-800 ml-1.5 tabular-nums">
                        · {project.reportReopenedAt}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    Bấm Chốt lại báo cáo sau khi hoàn tất điều chỉnh.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onLockProjectReport(project.id, false)}
                className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Chốt lại báo cáo</span>
              </button>
            </div>
          ) : (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-3">
              <span className="text-xs text-slate-600">
                Công trình đang mở báo cáo theo tuần. Khi hoàn thành quyết toán có thể chốt để khóa số liệu.
              </span>
              <button
                type="button"
                onClick={() => onLockProjectReport(project.id, true)}
                className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Chốt báo cáo (Quyết toán)</span>
              </button>
            </div>
          )}

          {/* Thông số & Phân công */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-5 border-b border-slate-200">
            <div>
              <div className="text-xs text-slate-500 mb-1">
                Phân công giám sát phụ trách
              </div>
              <div className="flex items-center gap-2">
                <select
                  aria-label="Phân công giám sát"
                  disabled={isLocked}
                  value={project.supervisorId ?? ''}
                  onChange={(e) =>
                    onAssignSupervisor(
                      project.id,
                      e.target.value ? e.target.value : null
                    )
                  }
                  className="flex-1 h-9 px-3 text-sm font-medium text-slate-900 bg-white disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-300 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                >
                  <option value="">-- Chưa phân công --</option>
                  {supervisors.map((sup) => (
                    <option key={sup.id} value={sup.id}>
                      {sup.name}
                    </option>
                  ))}
                </select>
                {assignedSupervisor && (
                  <button
                    type="button"
                    onClick={() => {
                      onJumpToSupervisorTab(assignedSupervisor.id);
                      onClose();
                    }}
                    className="h-9 px-3 inline-flex items-center gap-1 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <span>Mở tab</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-slate-500">Tổng mức đầu tư</div>
                <div className="font-mono font-semibold text-slate-900 tabular-nums mt-1">
                  {project.budgetBillionVND.toFixed(1)} tỷ đ
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Hạn hoàn thành</div>
                <div className="font-mono font-semibold text-slate-900 tabular-nums mt-1">
                  {project.targetEndDate}
                </div>
              </div>
            </div>

            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-slate-500 mb-1">
                  Nhóm công trình / Nguồn vốn
                </div>
                <select
                  aria-label="Nhóm công trình"
                  disabled={isLocked}
                  value={project.capitalGroup}
                  onChange={(e) =>
                    onUpdateProjectGroup(
                      project.id,
                      e.target.value,
                      project.areaGroup
                    )
                  }
                  className="w-full h-9 px-2.5 text-xs font-medium text-slate-900 bg-white disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-300 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                >
                  {Array.from(new Set([project.capitalGroup, ...capitalOptions])).map(
                    (cap) => (
                      <option key={cap} value={cap}>
                        {cap}
                      </option>
                    )
                  )}
                </select>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Khu vực</div>
                <select
                  aria-label="Khu vực công trình"
                  disabled={isLocked}
                  value={project.areaGroup}
                  onChange={(e) =>
                    onUpdateProjectGroup(
                      project.id,
                      project.capitalGroup,
                      e.target.value
                    )
                  }
                  className="w-full h-9 px-2.5 text-xs font-medium text-slate-900 bg-white disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-300 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                >
                  {Array.from(new Set([project.areaGroup, ...areaOptions])).map(
                    (area) => (
                      <option key={area} value={area}>
                        {area}
                      </option>
                    )
                  )}
                </select>
              </div>
            </div>

            <div className="sm:col-span-2 text-xs text-slate-600">
              <span className="text-slate-500">Quy mô thiết kế: </span>
              <span className="font-medium text-slate-800">
                {project.totalPlannedVolume}
              </span>
            </div>
          </div>

          {/* Phê duyệt các cấp đường ống & lũy kế */}
          {projectHasWaterPipes(project) && (
            <div className="pb-5 border-b border-slate-200 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                    <Ruler className="w-4 h-4 text-sky-700" />
                    <span>Phê duyệt các cấp đường ống &amp; Lũy kế</span>
                  </div>
                  <p className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
                    {pipeSummary?.hasPipes
                      ? pipeSummary.hasApprovedLengths
                        ? `Tổng phê duyệt: ${formatMeters(
                            pipeSummary.totalApprovedM
                          )} m · Lũy kế đến ${selectedWeek.label}: ${formatMeters(
                            pipeSummary.totalCumulativeM
                          )} m (${pipeSummary.cumulativePct}%)`
                        : `Đã nhận diện ${pipeSummary.rows.length} cấp ống · Lũy kế đã làm: ${formatMeters(
                            pipeSummary.totalCumulativeM
                          )} m (chưa nhập chiều dài phê duyệt)`
                      : 'Chưa thiết lập cấp ống phê duyệt.'}
                  </p>
                </div>
                {onUpdateApprovedPipes && !isEditingPipes && !isLocked && (
                  <button
                    type="button"
                    onClick={() => {
                      const existing = project.approvedPipes ?? [];
                      setPipeSpecsDraft(
                        existing.length > 0
                          ? existing.map((s) => ({ ...s }))
                          : [
                              {
                                id: `${project.id}-pipe-${Date.now()}-1`,
                                label: 'HDPE D110',
                                approvedLengthM: 0,
                                baselineCompletedM: 0,
                              },
                            ]
                      );
                      setIsEditingPipes(true);
                    }}
                    className="h-8 px-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 hover:text-sky-900 bg-sky-50 hover:bg-sky-100 rounded-md whitespace-nowrap shrink-0"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{pipeSummary?.hasPipes ? 'Sửa phê duyệt' : 'Nhập cấp ống'}</span>
                  </button>
                )}
              </div>

              {isEditingPipes && onUpdateApprovedPipes && !isLocked ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    onUpdateApprovedPipes(project.id, pipeSpecsDraft);
                    setIsEditingPipes(false);
                  }}
                  className="space-y-2.5"
                >
                  <datalist id="pipe-grade-presets-drawer">
                    {PIPE_GRADE_PRESETS.map((preset) => (
                      <option key={preset} value={preset} />
                    ))}
                  </datalist>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                          <th className="py-2 px-3">Cấp ống</th>
                          <th className="py-2 px-3 text-right w-28">Phê duyệt (m)</th>
                          <th className="py-2 px-3 text-right w-28">Đầu kỳ (m)</th>
                          <th className="py-2 px-2 w-9 text-center">Xóa</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {pipeSpecsDraft.map((spec, idx) => (
                          <tr key={spec.id || idx}>
                            <td className="py-1.5 px-2.5">
                              <input
                                type="text"
                                list="pipe-grade-presets-drawer"
                                value={spec.label}
                                onChange={(e) =>
                                  setPipeSpecsDraft((rows) =>
                                    rows.map((r, i) =>
                                      i === idx ? { ...r, label: e.target.value } : r
                                    )
                                  )
                                }
                                className="w-full h-8 px-2 text-xs border border-slate-300 rounded"
                              />
                            </td>
                            <td className="py-1.5 px-2.5">
                              <input
                                type="number"
                                min={0}
                                step="0.1"
                                value={spec.approvedLengthM}
                                onChange={(e) =>
                                  setPipeSpecsDraft((rows) =>
                                    rows.map((r, i) =>
                                      i === idx
                                        ? { ...r, approvedLengthM: Number(e.target.value) || 0 }
                                        : r
                                    )
                                  )
                                }
                                className="w-full h-8 px-2 text-right text-xs font-mono tabular-nums border border-slate-300 rounded"
                              />
                            </td>
                            <td className="py-1.5 px-2.5">
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
                                            baselineCompletedM: Number(e.target.value) || 0,
                                          }
                                        : r
                                    )
                                  )
                                }
                                className="w-full h-8 px-2 text-right text-xs font-mono tabular-nums border border-slate-300 rounded"
                              />
                            </td>
                            <td className="py-1.5 px-1.5 text-center">
                              <button
                                type="button"
                                aria-label="Xóa cấp ống"
                                onClick={() =>
                                  setPipeSpecsDraft((rows) =>
                                    rows.filter((_, i) => i !== idx)
                                  )
                                }
                                className="h-7 w-7 inline-flex items-center justify-center text-slate-400 hover:text-red-700 rounded"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setPipeSpecsDraft((rows) => [
                          ...rows,
                          {
                            id: `${project.id}-pipe-${Date.now()}-${rows.length + 1}`,
                            label: '',
                            approvedLengthM: 0,
                            baselineCompletedM: 0,
                          },
                        ])
                      }
                      className="h-8 px-2.5 inline-flex items-center gap-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm cấp ống</span>
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsEditingPipes(false)}
                        className="h-8 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        className="h-8 px-3 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-md"
                      >
                        Lưu
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                pipeSummary?.hasPipes && (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                          <th className="py-2 px-3">Cấp đường ống</th>
                          <th className="py-2 px-3 text-right">Phê duyệt (m)</th>
                          <th className="py-2 px-3 text-right">Tuần này (m)</th>
                          <th className="py-2 px-3 text-right">Lũy kế (m)</th>
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
                            <td className="py-2 px-3 text-right font-mono tabular-nums text-sky-700">
                              {row.weekM > 0 ? `+${formatMeters(row.weekM)}` : '0'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                              {formatMeters(row.cumulativeM)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                              {row.spec.approvedLengthM > 0 ? `${row.pct}%` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>
          )}

          {/* Báo cáo của tuần đang chọn */}
          <div>
            <div className="flex items-center justify-between gap-4 mb-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Báo cáo {selectedWeek.label} ({selectedWeek.dateRange})
              </h3>
              <StatusIndicator
                status={currentReport ? currentReport.status : 'missing'}
              />
            </div>

            {currentReport ? (
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

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3 border-y border-slate-200">
                  <div>
                    <div className="text-xs text-slate-500">
                      Trạng thái công trình
                    </div>
                    <div
                      className={`text-xs font-bold mt-1.5 ${getProjectStageToneClass(
                        currentReport.projectStage ||
                          resolveInheritedProjectStage({
                            project,
                            weekId: selectedWeek.id,
                            weeks,
                            reports,
                          }).stage
                      )}`}
                    >
                      {currentReport.projectStage ||
                        resolveInheritedProjectStage({
                          project,
                          weekId: selectedWeek.id,
                          weeks,
                          reports,
                        }).stage}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Tiến độ lũy kế</div>
                    <div className="text-lg font-bold font-mono text-slate-900 tabular-nums">
                      {currentReport.cumulativeProgress}%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Tăng trong tuần</div>
                    <div className="text-lg font-bold font-mono text-sky-700 tabular-nums">
                      +{isCarriedSettled ? 0 : currentReport.weeklyProgressDelta}%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Thời gian nộp</div>
                    <div className="text-xs font-mono text-slate-700 tabular-nums mt-1.5">
                      {currentReport.submittedAt}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium text-slate-500 mb-1">
                    Khối lượng thực hiện trong tuần
                  </div>
                  <p className="text-sm text-slate-900 font-medium">
                    {currentReport.weeklyVolume || '—'}
                  </p>
                </div>

                <div>
                  <div className="text-xs font-medium text-slate-500 mb-1">
                    Nội dung báo cáo chính
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {currentReport.summary}
                  </p>
                </div>

                {currentReport.issues && (
                  <div className="p-3.5 bg-red-50/70 border border-red-200 rounded-lg">
                    <div className="text-xs font-semibold text-red-800 mb-1">
                      Vướng mắc & Kiến nghị xử lý
                    </div>
                    <p className="text-sm text-red-900 leading-relaxed">
                      {currentReport.issues}
                    </p>
                  </div>
                )}

                {/* Chỉ đạo của lãnh đạo */}
                <form
                  onSubmit={handleSaveNote}
                  className="pt-4 border-t border-slate-200 space-y-2.5"
                >
                  <label
                    htmlFor="leader-directive-input"
                    className="flex items-center gap-1.5 text-xs font-semibold text-slate-800"
                  >
                    <MessageSquareText className="w-3.5 h-3.5 text-sky-700" />
                    <span>Ý kiến chỉ đạo của lãnh đạo ({selectedWeek.label})</span>
                  </label>
                  <textarea
                    id="leader-directive-input"
                    rows={2}
                    disabled={isLocked}
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder={
                      isLocked
                        ? 'Báo cáo đã chốt. Mở lại chỉnh sửa để cập nhật chỉ đạo.'
                        : 'Nhập chỉ đạo hoặc hướng xử lý gửi giám sát công trình...'
                    }
                    className="w-full px-3 py-2 text-sm text-slate-900 bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:bg-white"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-emerald-700 font-medium">
                      {noteSavedFeedback
                        ? 'Đã lưu ý kiến chỉ đạo.'
                        : isLocked
                          ? 'Mở lại chỉnh sửa để cập nhật chỉ đạo cho công trình đã chốt.'
                          : ''}
                    </span>
                    <button
                      type="submit"
                      disabled={isLocked}
                      className="px-4 py-1.5 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 disabled:opacity-45 disabled:pointer-events-none rounded-lg transition-colors whitespace-nowrap"
                    >
                      Lưu chỉ đạo
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600">
                Giám sát chưa nộp báo cáo cho {selectedWeek.label}.
                {assignedSupervisor && (
                  <span>
                    {' '}
                    Công trình hiện đang thuộc tab của{' '}
                    <strong className="text-slate-900">
                      {assignedSupervisor.name}
                    </strong>
                    .
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Lịch sử các tuần */}
          <div className="pt-4 border-t border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              Theo dõi tiến độ qua các tuần
            </h3>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                    <th className="py-2.5 px-3">Tuần</th>
                    <th className="py-2.5 px-3">Trạng thái</th>
                    <th className="py-2.5 px-3 text-right">Lũy kế</th>
                    <th className="py-2.5 px-3">Tóm tắt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {projectHistory.map(({ week, report }) => (
                    <tr
                      key={week.id}
                      className={
                        week.id === selectedWeek.id
                          ? 'bg-sky-50/50'
                          : 'hover:bg-slate-50'
                      }
                    >
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-800 whitespace-nowrap">
                        Tuần {week.weekNumber}
                      </td>
                      <td className="py-2.5 px-3">
                        {report?.projectStage ? (
                          <span
                            className={`text-xs font-semibold ${getProjectStageToneClass(
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
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {report ? `${report.cumulativeProgress}%` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 max-w-[260px] truncate">
                        {report ? report.weeklyVolume || report.summary : 'Chưa có dữ liệu'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
