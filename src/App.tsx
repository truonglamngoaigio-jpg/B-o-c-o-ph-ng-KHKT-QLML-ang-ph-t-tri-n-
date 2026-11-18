import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Droplets,
  FolderPlus,
  Layers,
  MapPin,
  Menu,
  Plus,
  RotateCcw,
  UserPlus,
  X,
} from 'lucide-react';
import { ImportExcelModal } from './components/ImportExcelModal';
import { LeadershipView } from './components/LeadershipView';
import {
  AddProjectGroupModal,
  AddProjectModal,
  AddSupervisorModal,
} from './components/Modals';
import { ProjectDetailDrawer } from './components/ProjectDetailDrawer';
import { SupervisorView } from './components/SupervisorView';
import { DEFAULT_WEEK_ID, WEEK_PERIODS } from './data/initialData';
import { useWaterProjectsStore } from './store/useWaterProjectsStore';
import { ActiveTab } from './types';
import {
  getCapitalAndAreaOptions,
  groupProjectsByCapitalAndArea,
  shouldRenderAreaSubDivider,
} from './utils/projectGrouping';

interface AssignmentNotice {
  id: number;
  projectName: string;
  supervisorId: string | null;
  supervisorName: string | null;
}

export default function App() {
  const {
    supervisors,
    projects,
    reports,
    projectGroups,
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
  } = useWaterProjectsStore();

  const [activeTab, setActiveTab] = useState<ActiveTab>({ type: 'leadership' });
  const [selectedCapitalGroup, setSelectedCapitalGroup] = useState<string>('all');
  const [selectedAreaGroup, setSelectedAreaGroup] = useState<string>('all');
  const [expandedSidebarGroups, setExpandedSidebarGroups] = useState<
    Record<string, boolean>
  >({
    'C. XDCB năm 2026': true,
  });
  const [selectedWeekId, setSelectedWeekId] = useState<string>(DEFAULT_WEEK_ID);
  const [drawerProjectId, setDrawerProjectId] = useState<string | null>(null);
  const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);
  const [isAddProjectGroupOpen, setIsAddProjectGroupOpen] = useState(false);
  const [isAddSupervisorOpen, setIsAddSupervisorOpen] = useState(false);
  const [isImportExcelOpen, setIsImportExcelOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [assignmentNotice, setAssignmentNotice] =
    useState<AssignmentNotice | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const selectedWeek =
    WEEK_PERIODS.find((w) => w.id === selectedWeekId) ?? WEEK_PERIODS[0];

  const sidebarProjectSections = useMemo(
    () => groupProjectsByCapitalAndArea(projects, projectGroups),
    [projects, projectGroups]
  );

  const { capitalOptions, allAreaOptions } = useMemo(
    () => getCapitalAndAreaOptions(projects, projectGroups),
    [projects, projectGroups]
  );

  const projectCountsBySupervisor = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of supervisors) {
      counts.set(s.id, 0);
    }
    for (const p of projects) {
      if (p.supervisorId) {
        counts.set(p.supervisorId, (counts.get(p.supervisorId) ?? 0) + 1);
      }
    }
    return counts;
  }, [projects, supervisors]);

  const activeSupervisor =
    activeTab.type === 'supervisor'
      ? supervisors.find((s) => s.id === activeTab.supervisorId) ?? null
      : null;

  const drawerProject = drawerProjectId
    ? projects.find((p) => p.id === drawerProjectId) ?? null
    : null;

  const nextCodeSuggestion = useMemo(() => {
    const nextNum = projects.length + 1;
    return `CN-2026-${String(nextNum).padStart(2, '0')}`;
  }, [projects.length]);

  const handleAssignSupervisor = (
    projectId: string,
    supervisorId: string | null
  ) => {
    const project = projects.find((p) => p.id === projectId);
    const supervisor = supervisorId
      ? supervisors.find((s) => s.id === supervisorId) ?? null
      : null;

    assignSupervisor(projectId, supervisorId);

    if (project) {
      setAssignmentNotice({
        id: Date.now(),
        projectName: project.name,
        supervisorId,
        supervisorName: supervisor?.name ?? null,
      });
    }
  };

  const handleJumpToSupervisorTab = (supervisorId: string) => {
    setActiveTab({ type: 'supervisor', supervisorId });
    setMobileNavOpen(false);
    setAssignmentNotice(null);
  };

  const handleSelectLeadership = () => {
    setActiveTab({ type: 'leadership' });
    setSelectedCapitalGroup('all');
    setSelectedAreaGroup('all');
    setMobileNavOpen(false);
  };

  const handleSelectCapitalSection = (capitalGroup: string) => {
    setActiveTab({ type: 'leadership' });
    setSelectedCapitalGroup(capitalGroup);
    setSelectedAreaGroup('all');
    setExpandedSidebarGroups((prev) => ({
      ...prev,
      [capitalGroup]: true,
    }));
    setMobileNavOpen(false);
  };

  const handleSelectAreaSection = (capitalGroup: string, areaGroup: string) => {
    setActiveTab({ type: 'leadership' });
    setSelectedCapitalGroup(capitalGroup);
    setSelectedAreaGroup(areaGroup);
    setExpandedSidebarGroups((prev) => ({
      ...prev,
      [capitalGroup]: true,
    }));
    setMobileNavOpen(false);
  };

  const toggleSidebarGroupExpand = (capitalGroup: string) => {
    setExpandedSidebarGroups((prev) => ({
      ...prev,
      [capitalGroup]: !prev[capitalGroup],
    }));
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-sky-100/80 border-r border-sky-200">
      {/* Brand Wordmark */}
      <div className="h-14 px-5 bg-sky-100/95 border-b border-sky-200 flex items-center justify-between shrink-0">
        <button
          type="button"
          onClick={handleSelectLeadership}
          className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 rounded-md"
        >
          <span className="h-7 w-7 rounded-md bg-sky-700 text-white inline-flex items-center justify-center shrink-0">
            <Droplets className="w-4 h-4" />
          </span>
          <span className="text-sm font-bold tracking-tight text-slate-900">
            KHKT&amp;QLML BTW
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Đóng danh sách tab"
          className="lg:hidden h-8 w-8 inline-flex items-center justify-center rounded-md text-sky-800 hover:bg-sky-200/60"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Two-zone Navigation: Top = Công trình (nhóm vốn & khu vực), Bottom = Tên giám sát */}
      <nav
        aria-label="Điều hướng công trình và giám sát"
        className="flex-1 min-h-0 flex flex-col overflow-hidden"
      >
        {/* TOP ZONE: Công trình */}
        <div className="flex-1 min-h-0 flex flex-col bg-sky-100/45 px-3 pt-3.5 pb-2 overflow-hidden">
          <div className="px-2 mb-1.5 flex items-center justify-between gap-2 shrink-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-sky-900/75">
              Công trình ({projects.length})
            </span>
            <button
              type="button"
              onClick={() => setIsAddProjectGroupOpen(true)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-800 hover:text-sky-950 whitespace-nowrap"
            >
              <FolderPlus className="w-3 h-3" />
              <span>Thêm nhóm</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-0.5 pr-0.5">
            {/* All projects / Báo cáo chính */}
            <button
              type="button"
              onClick={handleSelectLeadership}
              className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                activeTab.type === 'leadership' &&
                selectedCapitalGroup === 'all' &&
                selectedAreaGroup === 'all'
                  ? 'bg-white text-sky-950 shadow-xs ring-1 ring-sky-300/80'
                  : 'text-slate-800 hover:bg-sky-200/55 hover:text-slate-950'
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <BarChart3
                  className={`w-3.5 h-3.5 shrink-0 ${
                    activeTab.type === 'leadership' &&
                    selectedCapitalGroup === 'all' &&
                    selectedAreaGroup === 'all'
                      ? 'text-sky-700'
                      : 'text-sky-800/75'
                  }`}
                />
                <span className="truncate">Tất cả (Báo cáo chính)</span>
              </span>
              <span className="font-mono tabular-nums text-[11px] text-sky-900/75 shrink-0">
                {projects.length}
              </span>
            </button>

            {/* Capital Source & Area Groups */}
            {sidebarProjectSections.map((section) => {
              const areaSubItems = section.areas.filter((a) =>
                shouldRenderAreaSubDivider(section.capitalGroup, a.areaGroup)
              );
              const hasSubAreas = areaSubItems.length > 1;
              const isExpanded = Boolean(
                expandedSidebarGroups[section.capitalGroup]
              );
              const isCapSelected =
                activeTab.type === 'leadership' &&
                selectedCapitalGroup === section.capitalGroup &&
                selectedAreaGroup === 'all';

              return (
                <div key={section.capitalGroup} className="space-y-0.5">
                  <div
                    className={`flex items-center gap-1 rounded-lg transition-colors ${
                      isCapSelected
                        ? 'bg-white text-sky-950 shadow-xs ring-1 ring-sky-300/80'
                        : 'text-slate-800 hover:bg-sky-200/55 hover:text-slate-950'
                    }`}
                  >
                    {hasSubAreas ? (
                      <button
                        type="button"
                        onClick={() =>
                          toggleSidebarGroupExpand(section.capitalGroup)
                        }
                        aria-label={`Mở rộng khu vực của ${section.capitalGroup}`}
                        className="h-7 w-6 inline-flex items-center justify-center text-sky-800/70 hover:text-sky-950 shrink-0 ml-0.5"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </button>
                    ) : (
                      <span className="w-2 shrink-0" />
                    )}

                    <button
                      type="button"
                      title={section.capitalGroup}
                      onClick={() =>
                        handleSelectCapitalSection(section.capitalGroup)
                      }
                      className="flex-1 min-w-0 py-1.5 pr-2.5 flex items-center justify-between gap-2 text-left text-[11px] font-semibold"
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        <Layers
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isCapSelected ? 'text-sky-700' : 'text-sky-800/80'
                          }`}
                        />
                        <span className="truncate">{section.capitalGroup}</span>
                      </span>
                      <span className="font-mono tabular-nums text-[11px] text-sky-900/75 shrink-0">
                        {section.totalCount}
                      </span>
                    </button>
                  </div>

                  {hasSubAreas && isExpanded && (
                    <div className="pl-6 space-y-0.5">
                      {areaSubItems.map((area) => {
                        const isAreaSelected =
                          activeTab.type === 'leadership' &&
                          selectedCapitalGroup === section.capitalGroup &&
                          selectedAreaGroup === area.areaGroup;

                        return (
                          <button
                            key={`${section.capitalGroup}__${area.areaGroup}`}
                            type="button"
                            title={area.areaGroup}
                            onClick={() =>
                              handleSelectAreaSection(
                                section.capitalGroup,
                                area.areaGroup
                              )
                            }
                            className={`w-full flex items-center justify-between gap-2 px-2 py-1 rounded-md text-left text-[11px] transition-colors ${
                              isAreaSelected
                                ? 'bg-white/95 text-sky-950 font-semibold ring-1 ring-sky-300/75'
                                : 'text-slate-700 hover:bg-sky-200/50 hover:text-slate-950'
                            }`}
                          >
                            <span className="flex items-center gap-1.5 min-w-0">
                              <MapPin className="w-3 h-3 text-sky-700/80 shrink-0" />
                              <span className="truncate">{area.areaGroup}</span>
                            </span>
                            <span className="font-mono tabular-nums text-[10px] text-sky-900/70 shrink-0">
                              {area.projects.length}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* BOTTOM ZONE: Tên giám sát */}
        <div className="flex-1 min-h-0 flex flex-col bg-blue-100/55 border-t border-sky-200 px-3 pt-3 pb-2 overflow-hidden">
          <div className="px-2 mb-1.5 flex items-center justify-between gap-2 shrink-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-sky-900/75">
              Giám sát ({supervisors.length})
            </span>
            <button
              type="button"
              onClick={() => setIsAddSupervisorOpen(true)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-800 hover:text-sky-950 whitespace-nowrap"
            >
              <UserPlus className="w-3 h-3" />
              <span>Thêm</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 pr-0.5">
            {supervisors.map((sup) => {
              const isSelected =
                activeTab.type === 'supervisor' &&
                activeTab.supervisorId === sup.id;
              const count = projectCountsBySupervisor.get(sup.id) ?? 0;

              return (
                <button
                  key={sup.id}
                  type="button"
                  onClick={() => handleJumpToSupervisorTab(sup.id)}
                  className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                    isSelected
                      ? 'bg-white text-sky-950 shadow-xs ring-1 ring-blue-300/80'
                      : 'text-slate-800 hover:bg-blue-200/50 hover:text-slate-950'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`h-7 w-7 rounded-md text-[11px] font-bold font-mono inline-flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'bg-sky-700 text-white'
                          : 'bg-white/85 text-sky-900 ring-1 ring-sky-200/80'
                      }`}
                    >
                      {sup.initials}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">
                        {sup.name}
                      </div>
                      <div className="text-[11px] text-slate-600 truncate">
                        {sup.role}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`font-mono tabular-nums text-xs font-semibold shrink-0 ${
                      isSelected ? 'text-sky-900' : 'text-sky-900/75'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Bottom Data Reset Utility */}
      <div className="p-3 bg-sky-100/90 border-t border-sky-200 shrink-0">
        {confirmReset ? (
          <div className="p-2.5 bg-white/90 border border-sky-200 rounded-lg space-y-2">
            <p className="text-[11px] text-slate-700 leading-snug">
              Khôi phục lại danh sách công trình và báo cáo mẫu ban đầu?
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  resetDemoData();
                  setConfirmReset(false);
                  setAssignmentNotice(null);
                }}
                className="flex-1 h-7 text-[11px] font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md"
              >
                Xác nhận
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="flex-1 h-7 text-[11px] font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md"
              >
                Hủy
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="w-full h-8 px-2.5 inline-flex items-center gap-2 text-xs font-medium text-slate-700 hover:text-slate-950 hover:bg-sky-200/60 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Khôi phục dữ liệu mẫu</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-blue-50/70 text-slate-900">
      {/* Desktop Fixed Sidebar (280px) */}
      <aside className="hidden lg:block w-[280px] shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Slide-Over Sidebar */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/35"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-[280px] max-w-[85vw] h-full">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Workspace */}
      <div className="flex-1 min-w-0 flex flex-col bg-blue-50/65">
        {/* Top Bar Contract: Breadcrumb on Left, Single Primary Action on Right */}
        <header className="h-14 px-4 sm:px-8 bg-blue-50/90 backdrop-blur-xs border-b border-blue-200/80 flex items-center justify-between gap-8 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Mở danh sách tab"
              className="lg:hidden h-9 w-9 inline-flex items-center justify-center rounded-lg text-sky-800 hover:bg-blue-100/80 shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-xs sm:text-sm min-w-0 whitespace-nowrap">
              <span className="text-slate-600 hidden sm:inline">
                Quản lý Công trình
              </span>
              <span
                className="text-blue-300 hidden sm:inline"
                aria-hidden="true"
              >
                /
              </span>
              {activeTab.type === 'leadership' ? (
                selectedCapitalGroup === 'all' && selectedAreaGroup === 'all' ? (
                  <span className="font-semibold text-slate-900 truncate">
                    Báo cáo chính — Lãnh đạo
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleSelectLeadership}
                      className="text-slate-500 hover:text-slate-900 transition-colors hidden sm:inline"
                    >
                      Báo cáo chính
                    </button>
                    <span
                      className="text-slate-300 hidden sm:inline"
                      aria-hidden="true"
                    >
                      /
                    </span>
                    <span className="font-semibold text-slate-900 truncate">
                      {selectedCapitalGroup !== 'all'
                        ? selectedCapitalGroup
                        : 'Tất cả nguồn vốn'}
                      {selectedAreaGroup !== 'all'
                        ? ` — ${selectedAreaGroup}`
                        : ''}
                    </span>
                  </>
                )
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleSelectLeadership}
                    className="text-slate-500 hover:text-slate-900 transition-colors hidden sm:inline"
                  >
                    Giám sát
                  </button>
                  <span
                    className="text-slate-300 hidden sm:inline"
                    aria-hidden="true"
                  >
                    /
                  </span>
                  <span className="font-semibold text-slate-900 truncate">
                    {activeSupervisor?.name ?? 'Tab Giám sát'}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {activeTab.type === 'leadership' ? (
              <button
                type="button"
                onClick={() => setIsAddProjectOpen(true)}
                className="h-9 px-3.5 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Công trình mới</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSelectLeadership}
                className="h-9 px-3.5 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-blue-200 hover:bg-blue-100/60 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <span>Về Báo cáo chính</span>
              </button>
            )}
          </div>
        </header>

        {/* Quick Supervisor Tab Strip on Mobile/Tablet so switching tabs is always 1 click */}
        <div className="lg:hidden bg-blue-50/90 border-b border-blue-200/80 px-4 py-2 overflow-x-auto">
          <div className="flex items-center gap-1.5 w-max">
            <button
              type="button"
              onClick={handleSelectLeadership}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 ${
                activeTab.type === 'leadership'
                  ? 'bg-sky-700 text-white'
                  : 'bg-white/90 text-slate-700 border border-blue-200/70'
              }`}
            >
              Báo cáo chính ({projects.length})
            </button>
            {supervisors.map((sup) => {
              const isSelected =
                activeTab.type === 'supervisor' &&
                activeTab.supervisorId === sup.id;
              const count = projectCountsBySupervisor.get(sup.id) ?? 0;
              return (
                <button
                  key={sup.id}
                  type="button"
                  onClick={() => handleJumpToSupervisorTab(sup.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 ${
                    isSelected
                      ? 'bg-sky-700 text-white'
                      : 'bg-white/90 text-slate-700 border border-blue-200/70'
                  }`}
                >
                  {sup.name} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Viewport */}
        <main className="flex-1 px-4 sm:px-8 py-6 max-w-[1440px] w-full mx-auto">
          {/* Live Assignment Confirmation Banner */}
          {assignmentNotice && (
            <div
              role="status"
              className="mb-5 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-start sm:items-center gap-2.5 text-xs text-emerald-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5 sm:mt-0" />
                <span>
                  {assignmentNotice.supervisorName ? (
                    <>
                      Đã phân công{' '}
                      <strong>{assignmentNotice.projectName}</strong> cho{' '}
                      <strong>{assignmentNotice.supervisorName}</strong> — Công trình đã tự động chuyển về tab riêng của giám sát này.
                    </>
                  ) : (
                    <>
                      Đã chuyển <strong>{assignmentNotice.projectName}</strong> về trạng thái chưa phân công.
                    </>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {assignmentNotice.supervisorId && (
                  <button
                    type="button"
                    onClick={() =>
                      handleJumpToSupervisorTab(assignmentNotice.supervisorId!)
                    }
                    className="h-7 px-3 inline-flex items-center gap-1 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md whitespace-nowrap"
                  >
                    <span>Mở tab {assignmentNotice.supervisorName}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setAssignmentNotice(null)}
                  aria-label="Đóng thông báo"
                  className="h-7 w-7 inline-flex items-center justify-center text-emerald-700 hover:bg-emerald-100 rounded-md"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {importNotice && (
            <div
              role="status"
              className="mb-5 px-4 py-3 bg-sky-50 border border-sky-200 rounded-lg flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5 text-xs text-sky-950 font-medium">
                <CheckCircle2 className="w-4 h-4 text-sky-700 shrink-0" />
                <span>{importNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setImportNotice(null)}
                aria-label="Đóng thông báo nhập Excel"
                className="h-7 w-7 inline-flex items-center justify-center text-sky-700 hover:bg-sky-100 rounded-md shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {activeTab.type === 'leadership' || !activeSupervisor ? (
            <LeadershipView
              weeks={WEEK_PERIODS}
              selectedWeekId={selectedWeekId}
              onChangeWeek={setSelectedWeekId}
              projects={projects}
              projectGroups={projectGroups}
              supervisors={supervisors}
              reports={reports}
              capitalFilter={selectedCapitalGroup}
              areaFilter={selectedAreaGroup}
              onChangeCapitalFilter={setSelectedCapitalGroup}
              onChangeAreaFilter={setSelectedAreaGroup}
              onAssignSupervisor={handleAssignSupervisor}
              onSelectProject={(projectId) => setDrawerProjectId(projectId)}
              onJumpToSupervisorTab={handleJumpToSupervisorTab}
              onOpenAddProject={() => setIsAddProjectOpen(true)}
              onOpenImportExcel={() => setIsImportExcelOpen(true)}
            />
          ) : (
            <SupervisorView
              supervisor={activeSupervisor}
              weeks={WEEK_PERIODS}
              selectedWeekId={selectedWeekId}
              onChangeWeek={setSelectedWeekId}
              projects={projects}
              reports={reports}
              onSaveWeeklyReport={upsertWeeklyReport}
              onUpdateApprovedPipes={updateProjectApprovedPipes}
              onReopenProjectReport={reopenProjectReport}
              onLockProjectReport={lockProjectReport}
              onBackToLeadership={handleSelectLeadership}
            />
          )}
        </main>
      </div>

      {/* Project Detail Slide-Over Drawer */}
      <ProjectDetailDrawer
        project={drawerProject}
        selectedWeek={selectedWeek}
        weeks={WEEK_PERIODS}
        supervisors={supervisors}
        reports={reports}
        capitalOptions={capitalOptions}
        areaOptions={allAreaOptions}
        onClose={() => setDrawerProjectId(null)}
        onAssignSupervisor={handleAssignSupervisor}
        onUpdateProjectGroup={updateProjectGroup}
        onUpdateLeaderNote={updateLeaderNote}
        onUpdateApprovedPipes={updateProjectApprovedPipes}
        onReopenProjectReport={reopenProjectReport}
        onLockProjectReport={lockProjectReport}
        onJumpToSupervisorTab={handleJumpToSupervisorTab}
      />

      {/* Add Project Modal */}
      <AddProjectModal
        isOpen={isAddProjectOpen}
        supervisors={supervisors}
        capitalOptions={capitalOptions}
        areaOptions={allAreaOptions}
        defaultCapitalGroup={selectedCapitalGroup}
        defaultAreaGroup={selectedAreaGroup}
        nextCodeSuggestion={nextCodeSuggestion}
        onClose={() => setIsAddProjectOpen(false)}
        onCreateProject={(input) => {
          const created = addProject(input);
          if (created.supervisorId) {
            const sup = supervisors.find((s) => s.id === created.supervisorId);
            setAssignmentNotice({
              id: Date.now(),
              projectName: created.name,
              supervisorId: created.supervisorId,
              supervisorName: sup?.name ?? null,
            });
          }
        }}
      />

      {/* Add Project Group Modal */}
      <AddProjectGroupModal
        isOpen={isAddProjectGroupOpen}
        existingCapitalOptions={capitalOptions}
        onClose={() => setIsAddProjectGroupOpen(false)}
        onCreateProjectGroup={({ capitalGroup, areas }) => {
          addProjectGroup({ capitalGroup, areas });
          setActiveTab({ type: 'leadership' });
          setSelectedCapitalGroup(capitalGroup);
          setSelectedAreaGroup('all');
          setExpandedSidebarGroups((prev) => ({
            ...prev,
            [capitalGroup]: true,
          }));
        }}
      />

      {/* Add Supervisor Modal */}
      <AddSupervisorModal
        isOpen={isAddSupervisorOpen}
        onClose={() => setIsAddSupervisorOpen(false)}
        onCreateSupervisor={(input) => {
          const created = addSupervisor(input);
          setActiveTab({ type: 'supervisor', supervisorId: created.id });
        }}
      />

      {/* Import Excel Modal */}
      <ImportExcelModal
        isOpen={isImportExcelOpen}
        weeks={WEEK_PERIODS}
        defaultWeekId={selectedWeekId}
        onClose={() => setIsImportExcelOpen(false)}
        onConfirmImport={({ rows, weekId, mode }) => {
          importBatchData({ rows, weekId, mode });
          setSelectedWeekId(weekId);
          setActiveTab({ type: 'leadership' });
          const weekLabel =
            WEEK_PERIODS.find((w) => w.id === weekId)?.label ?? weekId;
          setImportNotice(
            `Đã nhập ${rows.length} công trình từ Excel vào ${weekLabel}. Các giám sát và tab riêng đã được cập nhật tự động.`
          );
        }}
      />
    </div>
  );
}
