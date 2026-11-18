import { Fragment, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  FileDown,
  FileSpreadsheet,
  FileText,
  Layers,
  Lock,
  MapPin,
  Plus,
  Search,
  Unlock,
  Upload,
} from 'lucide-react';
import {
  ProjectGroupDefinition,
  Supervisor,
  WaterProject,
  WeekPeriod,
  WeeklyReport,
} from '../types';
import { exportLeadershipExcel } from '../utils/exportExcel';
import {
  PdfReportModel,
  prepareLeadershipPdfModel,
} from '../utils/exportPdf';
import {
  AREA_GROUP_OPTIONS,
  CAPITAL_GROUP_OPTIONS,
  getCapitalAndAreaOptions,
  groupProjectsByCapitalAndArea,
  shouldRenderAreaSubDivider,
} from '../utils/projectGrouping';
import {
  EffectiveWeekReport,
  isProjectReportLocked,
  isProjectSettled,
  resolveEffectiveReportForWeek,
} from '../utils/projectLock';
import {
  getProjectStageToneClass,
  resolveInheritedProjectStage,
} from '../utils/projectStage';
import { PdfPreviewModal } from './PdfPreviewModal';
import { StatusIndicator } from './StatusIndicator';
import { WeekSelector } from './WeekSelector';

type FilterMode =
  | 'all'
  | 'reported'
  | 'locked'
  | 'missing'
  | 'issues'
  | 'unassigned';

interface LeadershipViewProps {
  weeks: WeekPeriod[];
  selectedWeekId: string;
  onChangeWeek: (weekId: string) => void;
  projects: WaterProject[];
  projectGroups: ProjectGroupDefinition[];
  supervisors: Supervisor[];
  reports: WeeklyReport[];
  capitalFilter: string;
  areaFilter: string;
  onChangeCapitalFilter: (capitalGroup: string) => void;
  onChangeAreaFilter: (areaGroup: string) => void;
  onAssignSupervisor: (projectId: string, supervisorId: string | null) => void;
  onSelectProject: (projectId: string) => void;
  onJumpToSupervisorTab: (supervisorId: string) => void;
  onOpenAddProject: () => void;
  onOpenImportExcel: () => void;
}

export function LeadershipView({
  weeks,
  selectedWeekId,
  onChangeWeek,
  projects,
  projectGroups,
  supervisors,
  reports,
  capitalFilter,
  areaFilter,
  onChangeCapitalFilter,
  onChangeAreaFilter,
  onAssignSupervisor,
  onSelectProject,
  onJumpToSupervisorTab,
  onOpenAddProject,
  onOpenImportExcel,
}: LeadershipViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [supervisorFilter, setSupervisorFilter] = useState<string>('all');
  const [collapsedCapitalGroups, setCollapsedCapitalGroups] = useState<
    Record<string, boolean>
  >({});
  const [previewPdfModel, setPreviewPdfModel] =
    useState<PdfReportModel | null>(null);

  const selectedWeek =
    weeks.find((w) => w.id === selectedWeekId) ?? weeks[0];

  const reportByProject = useMemo(() => {
    const map = new Map<string, EffectiveWeekReport>();
    for (const p of projects) {
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
  }, [projects, reports, selectedWeekId, weeks]);

  const supervisorMap = useMemo(() => {
    const map = new Map<string, Supervisor>();
    for (const s of supervisors) {
      map.set(s.id, s);
    }
    return map;
  }, [supervisors]);

  const scopedProjects = useMemo(() => {
    return projects.filter((p) => {
      if (capitalFilter !== 'all' && p.capitalGroup !== capitalFilter) {
        return false;
      }
      if (areaFilter !== 'all' && p.areaGroup !== areaFilter) {
        return false;
      }
      return true;
    });
  }, [projects, capitalFilter, areaFilter]);

  const kpis = useMemo(() => {
    const total = scopedProjects.length;
    const unassigned = scopedProjects.filter((p) => !p.supervisorId).length;
    let reportedCount = 0;
    let lockedCount = 0;
    let issueCount = 0;
    let progressSum = 0;

    for (const p of scopedProjects) {
      const rep = reportByProject.get(p.id)?.report;
      const locked = isProjectReportLocked(p);
      if (locked) lockedCount += 1;
      if (rep || locked) {
        reportedCount += 1;
        progressSum += rep ? rep.cumulativeProgress : 100;
        if (
          rep &&
          (rep.status === 'attention' ||
            rep.status === 'delayed' ||
            rep.issues)
        ) {
          issueCount += 1;
        }
      }
    }

    const avgProgress =
      reportedCount > 0 ? Math.round((progressSum / reportedCount) * 10) / 10 : 0;
    const reportRate =
      total > 0 ? Math.round((reportedCount / total) * 100) : 0;

    return {
      total,
      unassigned,
      reportedCount,
      lockedCount,
      issueCount,
      avgProgress,
      reportRate,
    };
  }, [scopedProjects, reportByProject]);

  const { capitalOptions } = useMemo(
    () => getCapitalAndAreaOptions(projects, projectGroups),
    [projects, projectGroups]
  );

  const areaOptions = useMemo(() => {
    const set = new Set<string>();
    if (capitalFilter !== 'all') {
      for (const p of projects) {
        if (p.capitalGroup === capitalFilter && p.areaGroup) {
          set.add(p.areaGroup);
        }
      }
      for (const grp of projectGroups) {
        if (grp.capitalGroup === capitalFilter) {
          for (const a of grp.areas) {
            if (a.trim()) set.add(a.trim());
          }
        }
      }
    } else {
      for (const a of AREA_GROUP_OPTIONS) set.add(a);
      for (const p of projects) {
        if (p.areaGroup) set.add(p.areaGroup);
      }
      for (const grp of projectGroups) {
        for (const a of grp.areas) {
          if (a.trim()) set.add(a.trim());
        }
      }
    }

    const ordered: string[] = [];
    for (const a of AREA_GROUP_OPTIONS) {
      if (set.has(a)) {
        ordered.push(a);
        set.delete(a);
      }
    }
    for (const extra of Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'))) {
      ordered.push(extra);
    }
    return ordered;
  }, [projects, projectGroups, capitalFilter]);

  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return scopedProjects.filter((project) => {
      const rep = reportByProject.get(project.id)?.report;
      const locked = isProjectReportLocked(project);
      const hasReportOrLocked = Boolean(rep) || locked;

      if (filterMode === 'reported' && !hasReportOrLocked) return false;
      if (filterMode === 'locked' && !locked) return false;
      if (filterMode === 'missing' && hasReportOrLocked) return false;
      if (
        filterMode === 'issues' &&
        !(
          rep &&
          (rep.status === 'attention' ||
            rep.status === 'delayed' ||
            Boolean(rep.issues))
        )
      ) {
        return false;
      }
      if (filterMode === 'unassigned' && project.supervisorId !== null) {
        return false;
      }

      if (supervisorFilter !== 'all') {
        if (supervisorFilter === 'unassigned') {
          if (project.supervisorId !== null) return false;
        } else if (project.supervisorId !== supervisorFilter) {
          return false;
        }
      }

      if (q) {
        const supName = project.supervisorId
          ? supervisorMap.get(project.supervisorId)?.name.toLowerCase() ?? ''
          : '';
        const haystack = `${project.code} ${project.name} ${project.capitalGroup} ${project.areaGroup} ${project.location} ${project.category} ${supName}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [
    scopedProjects,
    reportByProject,
    filterMode,
    supervisorFilter,
    searchQuery,
    supervisorMap,
  ]);

  const groupedSections = useMemo(
    () => groupProjectsByCapitalAndArea(filteredProjects),
    [filteredProjects]
  );

  const toggleCapitalGroup = (capitalGroup: string) => {
    setCollapsedCapitalGroups((prev) => ({
      ...prev,
      [capitalGroup]: !prev[capitalGroup],
    }));
  };

  const handleExportExcel = () => {
    exportLeadershipExcel({
      weeks,
      selectedWeek,
      projects: filteredProjects,
      allProjects: projects,
      supervisors,
      reports,
    });
  };

  const handleOpenPdfReview = () => {
    const model = prepareLeadershipPdfModel({
      weeks,
      selectedWeek,
      projects: filteredProjects,
      supervisors,
      reports,
    });
    setPreviewPdfModel(model);
  };

  return (
    <div className="space-y-6">
      {/* Executive Header & Week Selector */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-sky-700 mb-1">
            {capitalFilter === 'all' && areaFilter === 'all'
              ? 'Tổng hợp điều hành dành cho Lãnh đạo'
              : `BÁO CÁO TỔNG HỢP · ${
                  capitalFilter !== 'all' ? capitalFilter : 'Tất cả nguồn vốn'
                }${areaFilter !== 'all' ? ` · ${areaFilter}` : ''}`}
          </p>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight text-balance">
            {areaFilter !== 'all'
              ? areaFilter
              : capitalFilter !== 'all'
              ? capitalFilter
              : 'BÁO CÁO TỔNG HỢP'}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {capitalFilter === 'all' && areaFilter === 'all'
              ? 'Chọn nhóm công trình ở cột trái hoặc chọn tuần để xem báo cáo và phân công trực tiếp về tab riêng của từng giám sát.'
              : `Đang hiển thị ${scopedProjects.length} công trình thuộc nhóm đã chọn trong ${selectedWeek.label}.`}
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
            onClick={onOpenImportExcel}
            className="h-10 px-3.5 inline-flex items-center gap-2 text-xs font-medium text-slate-700 bg-white border border-blue-200/90 hover:bg-blue-50 hover:text-slate-900 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Upload className="w-4 h-4 text-sky-700" />
            <span>Nhập từ Excel</span>
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="h-10 px-3.5 inline-flex items-center gap-2 text-xs font-medium text-slate-700 bg-white border border-blue-200/90 hover:bg-blue-50 hover:text-slate-900 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
            <span>Xuất Excel (.xlsx)</span>
          </button>
          <button
            type="button"
            disabled={filteredProjects.length === 0}
            onClick={handleOpenPdfReview}
            className="h-10 px-3.5 inline-flex items-center gap-2 text-xs font-medium text-slate-700 bg-white border border-blue-200/90 hover:bg-blue-50 hover:text-slate-900 disabled:opacity-45 disabled:pointer-events-none rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <FileDown className="w-4 h-4 text-red-700" />
            <span>Xuất PDF</span>
          </button>
          <button
            type="button"
            onClick={onOpenAddProject}
            className="h-10 px-4 inline-flex items-center gap-2 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm công trình</span>
          </button>
        </div>
      </div>

      {/* 4-Column Executive KPI Strip (Single elevation, hairline divided) */}
      <section
        aria-label="Chỉ số tổng hợp tuần"
        className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-blue-200/85 rounded-lg divide-y lg:divide-y-0 lg:divide-x divide-blue-100"
      >
        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">
            Tổng số công trình
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {kpis.total}
            </span>
            <span className="text-xs text-slate-500 tabular-nums">
              {kpis.unassigned > 0
                ? `${kpis.unassigned} chưa phân công`
                : 'Đã phân công đủ'}
            </span>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">
            Đã nộp báo cáo ({selectedWeek.label})
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {kpis.reportedCount}/{kpis.total}
            </span>
            <span className="text-xs font-mono text-emerald-700 font-medium tabular-nums">
              {kpis.reportRate}%
            </span>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">
            Tiến độ lũy kế bình quân
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-sky-700">
              {kpis.avgProgress}%
            </span>
            <span className="text-xs text-slate-500">
              trên các công trình đã báo cáo
            </span>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">
            Vướng mắc / Cần lưu ý
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span
              className={`text-2xl font-bold font-mono tabular-nums ${
                kpis.issueCount > 0 ? 'text-amber-700' : 'text-slate-900'
              }`}
            >
              {kpis.issueCount}
            </span>
            {kpis.issueCount > 0 && (
              <button
                type="button"
                onClick={() =>
                  setFilterMode(filterMode === 'issues' ? 'all' : 'issues')
                }
                className="text-xs font-medium text-sky-700 hover:underline whitespace-nowrap"
              >
                {filterMode === 'issues' ? 'Hiện tất cả' : 'Lọc công trình'}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div
          className="inline-flex flex-wrap items-center gap-1 p-1 bg-blue-100/60 border border-blue-200/80 rounded-lg"
          role="tablist"
          aria-label="Lọc trạng thái báo cáo"
        >
          {(
            [
              { id: 'all', label: `Tất cả (${kpis.total})` },
              {
                id: 'reported',
                label: `Đã báo cáo (${kpis.reportedCount})`,
              },
              {
                id: 'locked',
                label: `Đã chốt QT (${kpis.lockedCount})`,
              },
              {
                id: 'missing',
                label: `Chưa báo cáo (${kpis.total - kpis.reportedCount})`,
              },
              { id: 'issues', label: `Cần lưu ý (${kpis.issueCount})` },
              {
                id: 'unassigned',
                label: `Chưa phân công (${kpis.unassigned})`,
              },
            ] as { id: FilterMode; label: string }[]
          ).map((tab) => {
            const active = filterMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilterMode(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white text-sky-950 shadow-xs'
                    : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 sm:flex-none">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm mã, tên công trình, khu vực..."
              className="h-9 w-full sm:w-56 pl-9 pr-3 text-xs text-slate-900 bg-white border border-blue-200/90 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
            />
          </div>

          <select
            aria-label="Lọc theo vốn đầu tư"
            value={capitalFilter}
            onChange={(e) => {
              onChangeCapitalFilter(e.target.value);
              onChangeAreaFilter('all');
            }}
            className="h-9 px-2.5 text-xs font-medium text-slate-700 bg-white border border-blue-200/90 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 max-w-[220px]"
          >
            <option value="all">Tất cả vốn đầu tư</option>
            {capitalOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            aria-label="Lọc theo khu vực"
            value={areaFilter}
            onChange={(e) => onChangeAreaFilter(e.target.value)}
            className="h-9 px-2.5 text-xs font-medium text-slate-700 bg-white border border-blue-200/90 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 max-w-[190px]"
          >
            <option value="all">Tất cả khu vực</option>
            {areaOptions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>

          <select
            aria-label="Lọc theo giám sát"
            value={supervisorFilter}
            onChange={(e) => setSupervisorFilter(e.target.value)}
            className="h-9 px-2.5 text-xs font-medium text-slate-700 bg-white border border-blue-200/90 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
          >
            <option value="all">Tất cả giám sát</option>
            <option value="unassigned">Chưa phân công</option>
            {supervisors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Executive Weekly Report Table */}
      <div className="bg-white border border-blue-200/85 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[980px]">
            <thead>
              <tr className="bg-blue-50/80 border-b border-blue-200/80 text-xs font-semibold text-sky-950/80">
                <th className="py-3 px-4 w-[25%]">Công trình cấp nước</th>
                <th className="py-3 px-4 w-[20%]">Phân công giám sát</th>
                <th className="py-3 px-4 w-[13%]">Trạng thái tuần</th>
                <th className="py-3 px-4 w-[12%] text-right">Tiến độ</th>
                <th className="py-3 px-4 w-[22%]">
                  Nội dung báo cáo chính ({selectedWeek.label})
                </th>
                <th className="py-3 px-4 w-[8%] text-right">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-100 text-sm">
              {filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 px-6 text-center">
                    {scopedProjects.length === 0 ? (
                      <>
                        <p className="text-sm font-medium text-slate-700">
                          Nhóm này chưa có công trình nào.
                        </p>
                        <button
                          type="button"
                          onClick={onOpenAddProject}
                          className="mt-3 px-4 py-2 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Thêm công trình vào nhóm này</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-slate-700">
                          Không tìm thấy công trình nào phù hợp với bộ lọc hiện tại.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setFilterMode('all');
                            onChangeCapitalFilter('all');
                            onChangeAreaFilter('all');
                            setSupervisorFilter('all');
                            setSearchQuery('');
                          }}
                          className="mt-3 px-3.5 py-1.5 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg transition-colors"
                        >
                          Xóa bộ lọc
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ) : (
                groupedSections.map((section) => {
                  const showCapitalDivider = capitalFilter === 'all';
                  const isCollapsed =
                    showCapitalDivider &&
                    Boolean(collapsedCapitalGroups[section.capitalGroup]);
                  let sectionReported = 0;
                  for (const a of section.areas) {
                    for (const p of a.projects) {
                      if (
                        reportByProject.get(p.id)?.report ||
                        isProjectReportLocked(p)
                      ) {
                        sectionReported += 1;
                      }
                    }
                  }

                  return (
                    <Fragment key={section.capitalGroup}>
                      {/* Capital Source Divider Header (shown when viewing all capital groups) */}
                      {showCapitalDivider && (
                        <tr className="bg-blue-100/60 border-y border-blue-200/80">
                          <td colSpan={6} className="py-2.5 px-4">
                            <button
                              type="button"
                              onClick={() =>
                                toggleCapitalGroup(section.capitalGroup)
                              }
                              aria-expanded={!isCollapsed}
                              className="w-full flex items-center justify-between gap-4 text-left group focus-visible:outline-none"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {isCollapsed ? (
                                  <ChevronRight className="w-4 h-4 text-sky-800/70 shrink-0" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-sky-900 shrink-0" />
                                )}
                                <Layers className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                                <span className="text-xs font-bold uppercase tracking-wide text-slate-900 group-hover:text-sky-800 transition-colors truncate">
                                  {section.capitalGroup}
                                </span>
                              </div>
                              <span className="text-xs text-slate-600 font-mono tabular-nums whitespace-nowrap shrink-0">
                                {section.totalCount} công trình · Đã báo cáo{' '}
                                {sectionReported}/{section.totalCount}
                              </span>
                            </button>
                          </td>
                        </tr>
                      )}

                      {!isCollapsed &&
                        section.areas.map((area) => {
                          const showAreaDivider =
                            areaFilter === 'all' &&
                            shouldRenderAreaSubDivider(
                              section.capitalGroup,
                              area.areaGroup
                            ) &&
                            (showCapitalDivider || section.areas.length > 1);

                          return (
                            <Fragment
                              key={`${section.capitalGroup}__${area.areaGroup}`}
                            >
                              {showAreaDivider && (
                                <tr className="bg-sky-50/75 border-y border-blue-100">
                                  <td
                                    colSpan={6}
                                    className={`py-2 px-4 ${
                                      showCapitalDivider ? 'pl-9' : ''
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-4">
                                      <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-900">
                                        <MapPin className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                                        <span>{area.areaGroup}</span>
                                      </div>
                                      <span className="text-[11px] font-mono tabular-nums text-slate-500">
                                        {area.projects.length} công trình
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                              )}

                              {area.projects.map((project) => {
                                const reportEntry = reportByProject.get(project.id);
                                const report = reportEntry?.report ?? null;
                                const isCarriedSettled = Boolean(
                                  reportEntry?.isCarriedSettled
                                );
                                const isLocked = isProjectReportLocked(project);
                                const isSettled = isProjectSettled(project);
                                const assignedSupervisor = project.supervisorId
                                  ? supervisorMap.get(project.supervisorId)
                                  : undefined;

                                return (
                                  <tr
                                    key={project.id}
                                    className="hover:bg-blue-50/45 transition-colors align-top"
                                  >
                      {/* Col 1: Project Identity */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2 text-xs text-slate-500 mb-0.5">
                          <span className="font-mono font-medium text-sky-700">
                            {project.code}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{project.category}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onSelectProject(project.id)}
                          className="text-left text-sm font-semibold text-slate-900 hover:text-sky-700 transition-colors leading-snug"
                        >
                          {project.name}
                        </button>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {project.location}
                        </div>
                      </td>

                      {/* Col 2: Direct Supervisor Assignment */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1.5">
                          <select
                            aria-label={`Phân công giám sát cho ${project.name}`}
                            disabled={isLocked}
                            value={project.supervisorId ?? ''}
                            onChange={(e) =>
                              onAssignSupervisor(
                                project.id,
                                e.target.value ? e.target.value : null
                              )
                            }
                            className={`w-full h-9 px-2.5 text-xs font-medium rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 ${
                              isLocked
                                ? 'bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed'
                                : project.supervisorId
                                  ? 'bg-white border-slate-200 text-slate-900 hover:border-slate-300 cursor-pointer'
                                  : 'bg-amber-50/70 border-amber-300 text-amber-900 cursor-pointer'
                            }`}
                          >
                            <option value="">-- Chưa phân công --</option>
                            {supervisors.map((sup) => (
                              <option key={sup.id} value={sup.id}>
                                {sup.name}
                              </option>
                            ))}
                          </select>

                          {assignedSupervisor ? (
                            <button
                              type="button"
                              onClick={() =>
                                onJumpToSupervisorTab(assignedSupervisor.id)
                              }
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 hover:text-sky-900 hover:underline whitespace-nowrap"
                            >
                              <span>Xem tab của {assignedSupervisor.name}</span>
                              <ArrowUpRight className="w-3 h-3" />
                            </button>
                          ) : (
                            <div className="text-[11px] text-amber-700">
                              Chọn giám sát để tự chuyển về tab riêng
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Col 3: Status */}
                      <td className="py-3.5 px-4 pt-4">
                        {(() => {
                          const stageInfo = resolveInheritedProjectStage({
                            project,
                            weekId: selectedWeek.id,
                            weeks,
                            reports,
                          });
                          const stageLabel =
                            report?.projectStage || stageInfo.stage;

                          return (
                            <>
                              {report ? (
                                <div
                                  className={`text-xs font-bold leading-snug ${getProjectStageToneClass(
                                    stageLabel
                                  )}`}
                                >
                                  {stageLabel}
                                </div>
                              ) : (
                                <>
                                  <StatusIndicator status="missing" />
                                  {stageLabel &&
                                    stageLabel !== 'CHƯA THI CÔNG' && (
                                      <div className="mt-1 text-[11px] font-medium text-slate-600">
                                        Gối: {stageLabel}
                                      </div>
                                    )}
                                </>
                              )}
                            </>
                          );
                        })()}
                        {isLocked ? (
                          <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-slate-600">
                            <Lock className="w-3 h-3 text-slate-500" />
                            <span>Đã chốt QT</span>
                          </div>
                        ) : (
                          isSettled && (
                            <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
                              <Unlock className="w-3 h-3" />
                              <span>Đang mở lại sửa</span>
                            </div>
                          )
                        )}
                        {report && (
                          <div className="text-[11px] font-mono text-slate-400 tabular-nums mt-1">
                            {report.submittedAt}
                          </div>
                        )}
                      </td>

                      {/* Col 4: Progress */}
                      <td className="py-3.5 px-4 text-right">
                        {report ? (
                          <div>
                            <div className="text-sm font-bold font-mono tabular-nums text-slate-900">
                              {report.cumulativeProgress}%
                            </div>
                            <div className="text-[11px] font-mono tabular-nums text-sky-700 mt-0.5">
                              +{isCarriedSettled ? 0 : report.weeklyProgressDelta}% tuần
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1.5">
                              <div
                                className={`h-full rounded-full ${
                                  report.status === 'delayed'
                                    ? 'bg-red-600'
                                    : report.status === 'attention'
                                    ? 'bg-amber-500'
                                    : 'bg-sky-600'
                                }`}
                                style={{
                                  width: `${report.cumulativeProgress}%`,
                                }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs font-mono text-slate-400">
                            —
                          </span>
                        )}
                      </td>

                      {/* Col 5: Weekly Summary */}
                      <td className="py-3.5 px-4">
                        {report ? (
                          <div className="space-y-1 text-xs">
                            <p className="font-medium text-slate-900 line-clamp-1">
                              {report.weeklyVolume}
                            </p>
                            <p className="text-slate-600 line-clamp-2 leading-relaxed">
                              {report.summary}
                            </p>
                            {report.issues && (
                              <p className="text-red-700 font-medium line-clamp-1">
                                Vướng mắc: {report.issues}
                              </p>
                            )}
                            {report.leaderNote && (
                              <p className="text-sky-700 line-clamp-1">
                                Chỉ đạo: {report.leaderNote}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">
                            Chờ giám sát nộp báo cáo {selectedWeek.label}
                          </span>
                        )}
                      </td>

                      {/* Col 6: Action */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => onSelectProject(project.id)}
                          className="h-8 px-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-sky-700 hover:bg-sky-50 border border-slate-200 rounded-md transition-colors whitespace-nowrap"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Xem</span>
                        </button>
                      </td>
                    </tr>
                                );
                              })}
                            </Fragment>
                          );
                        })}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PdfPreviewModal
        isOpen={previewPdfModel !== null}
        model={previewPdfModel}
        onClose={() => setPreviewPdfModel(null)}
      />
    </div>
  );
}
