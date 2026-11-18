import * as XLSX from 'xlsx';
import { Supervisor, WaterProject, WeekPeriod, WeeklyReport } from '../types';
import {
  groupProjectsByCapitalAndArea,
  shouldRenderAreaSubDivider,
} from './projectGrouping';
import { evaluateSupervisorProgress } from './pipeProgress';
import {
  isProjectReportLocked,
  resolveEffectiveReportForWeek,
} from './projectLock';

function formatStatusLabel(status: WeeklyReport['status'] | undefined): string {
  if (status === 'on_track') return 'Đúng tiến độ';
  if (status === 'attention') return 'Cần lưu ý';
  if (status === 'delayed') return 'Chậm tiến độ';
  return 'Chưa báo cáo';
}

function formatExportTimestamp(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function formatWeekCellContent(rep: WeeklyReport | undefined): string {
  if (!rep) return '';
  const parts: string[] = [];
  parts.push(
    `[${rep.cumulativeProgress}% · ${formatStatusLabel(rep.status)}${
      rep.weeklyProgressDelta > 0 ? ` · +${rep.weeklyProgressDelta}%` : ''
    }]`
  );
  if (rep.weeklyVolume) {
    parts.push(rep.weeklyVolume);
  }
  if (rep.summary && rep.summary !== rep.weeklyVolume) {
    parts.push(rep.summary);
  }
  if (rep.issues) {
    parts.push(`Vướng mắc: ${rep.issues}`);
  }
  if (rep.leaderNote) {
    parts.push(`Chỉ đạo: ${rep.leaderNote}`);
  }
  return parts.join('\n');
}

export function exportLeadershipExcel(params: {
  weeks: WeekPeriod[];
  selectedWeek: WeekPeriod;
  projects: WaterProject[];
  allProjects: WaterProject[];
  supervisors: Supervisor[];
  reports: WeeklyReport[];
}) {
  const {
    weeks,
    selectedWeek,
    projects,
    allProjects,
    supervisors,
    reports,
  } = params;

  const supervisorMap = new Map<string, Supervisor>();
  for (const s of supervisors) {
    supervisorMap.set(s.id, s);
  }

  const reportByProjectWeek = new Map<string, WeeklyReport>();
  for (const r of reports) {
    reportByProjectWeek.set(`${r.projectId}__${r.weekId}`, r);
  }

  const groupedSections = groupProjectsByCapitalAndArea(projects);

  // ==================== SHEET 1: TẤT CẢ CÁC TUẦN (MA TRẬN ĐẦY ĐỦ) ====================
  const allWeeksHeader = [
    'STT',
    'Mã công trình',
    'Tên công trình',
    'Nguồn vốn đầu tư',
    'Khu vực',
    'Hạng mục',
    'Phụ trách',
    'Tiến độ chung',
    'Lũy kế (Thi công / Phê duyệt)',
    ...weeks.map((w) => `${w.label}\n(${w.dateRange})`),
  ];

  const allWeeksRows: (string | number)[][] = [
    ['KHKT&QLML BTW — BÁO CÁO TỔNG HỢP CÔNG TRÌNH CẤP NƯỚC — TOÀN BỘ CÁC TUẦN'],
    [
      `Ngày xuất: ${formatExportTimestamp()}`,
      '',
      `Số công trình: ${projects.length}`,
      '',
      `Số tuần: ${weeks.length} (${weeks[0]?.label ?? ''} → ${
        weeks[weeks.length - 1]?.label ?? ''
      })`,
    ],
    [],
    allWeeksHeader,
  ];

  let allWeeksIdx = 0;
  for (const section of groupedSections) {
    allWeeksRows.push([
      '',
      section.capitalGroup.toUpperCase(),
      `(${section.totalCount} công trình)`,
    ]);

    for (const area of section.areas) {
      if (shouldRenderAreaSubDivider(section.capitalGroup, area.areaGroup)) {
        allWeeksRows.push([
          '',
          area.areaGroup,
          `(${area.projects.length} công trình)`,
        ]);
      }

      for (const p of area.projects) {
        allWeeksIdx += 1;
        const supName = p.supervisorId
          ? supervisorMap.get(p.supervisorId)?.name ?? 'Chưa phân công'
          : 'Chưa phân công';

        const weekCells = weeks.map((w) =>
          formatWeekCellContent(reportByProjectWeek.get(`${p.id}__${w.id}`))
        );

        allWeeksRows.push([
          allWeeksIdx,
          p.code,
          p.name,
          p.capitalGroup,
          p.areaGroup,
          p.category,
          supName,
          p.targetEndDate,
          p.totalPlannedVolume,
          ...weekCells,
        ]);
      }
    }
  }

  const allWeeksSheet = XLSX.utils.aoa_to_sheet(allWeeksRows);
  allWeeksSheet['!cols'] = [
    { wch: 5 },  // STT
    { wch: 14 }, // Mã
    { wch: 44 }, // Tên công trình
    { wch: 30 }, // Nguồn vốn
    { wch: 24 }, // Khu vực
    { wch: 20 }, // Hạng mục
    { wch: 16 }, // Phụ trách
    { wch: 18 }, // Tiến độ chung
    { wch: 34 }, // Lũy kế
    ...weeks.map(() => ({ wch: 36 })),
  ];

  // ==================== SHEET 2: CHI TIẾT TUẦN ĐANG CHỌN ====================
  const selectedWeekRows: (string | number)[][] = [
    [`BÁO CÁO CHI TIẾT ${selectedWeek.label.toUpperCase()} (${selectedWeek.dateRange})`],
    [
      `Ngày xuất: ${formatExportTimestamp()}`,
      '',
      `Tổng công trình: ${projects.length}`,
    ],
    [],
    [
      'STT',
      'Mã công trình',
      'Tên công trình',
      'Nguồn vốn đầu tư',
      'Khu vực',
      'Hạng mục',
      'Giám sát phụ trách',
      'Trạng thái tuần',
      'Tiến độ lũy kế (%)',
      'Tăng tuần (%)',
      'Khối lượng thực hiện tuần',
      'Nội dung báo cáo chính',
      'Vướng mắc / Kiến nghị',
      'Chỉ đạo của lãnh đạo',
      'Tiến độ chung',
      'Thời gian nộp',
    ],
  ];

  let selectedIdx = 0;
  for (const section of groupedSections) {
    selectedWeekRows.push([
      '',
      section.capitalGroup.toUpperCase(),
      `(${section.totalCount} công trình)`,
    ]);

    for (const area of section.areas) {
      if (shouldRenderAreaSubDivider(section.capitalGroup, area.areaGroup)) {
        selectedWeekRows.push([
          '',
          area.areaGroup,
          `(${area.projects.length} công trình)`,
        ]);
      }

      for (const p of area.projects) {
        selectedIdx += 1;
        const repEntry = resolveEffectiveReportForWeek({
          project: p,
          weekId: selectedWeek.id,
          weeks,
          reports,
        });
        const rep = repEntry.report;
        const locked = isProjectReportLocked(p);
        const supName = p.supervisorId
          ? supervisorMap.get(p.supervisorId)?.name ?? 'Chưa phân công'
          : 'Chưa phân công';

        const stageLabel = rep?.projectStage || (locked ? 'ĐÃ QUYẾT TOÁN' : '');
        const statusLabel = locked
          ? `${stageLabel || formatStatusLabel(rep?.status ?? 'on_track')} (Đã chốt QT)`
          : stageLabel || formatStatusLabel(rep?.status);

        selectedWeekRows.push([
          selectedIdx,
          p.code,
          p.name,
          p.capitalGroup,
          p.areaGroup,
          p.category,
          supName,
          statusLabel,
          rep ? rep.cumulativeProgress : '',
          rep ? (repEntry.isCarriedSettled ? 0 : rep.weeklyProgressDelta) : '',
          rep?.weeklyVolume ?? (locked ? 'Đã quyết toán (Chốt báo cáo)' : ''),
          rep?.summary ?? '',
          rep?.issues ?? '',
          rep?.leaderNote ?? '',
          p.targetEndDate,
          rep?.submittedAt ?? '',
        ]);
      }
    }
  }

  const selectedWeekSheet = XLSX.utils.aoa_to_sheet(selectedWeekRows);
  selectedWeekSheet['!cols'] = [
    { wch: 5 },
    { wch: 14 },
    { wch: 42 },
    { wch: 30 },
    { wch: 24 },
    { wch: 20 },
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
    { wch: 36 },
    { wch: 46 },
    { wch: 36 },
    { wch: 34 },
    { wch: 18 },
    { wch: 18 },
  ];

  // ==================== SHEET 3: TỔNG HỢP THEO GIÁM SÁT ====================
  const summaryRows: (string | number)[][] = [
    [`TỔNG HỢP THEO GIÁM SÁT — ${selectedWeek.label} (${selectedWeek.dateRange})`],
    [],
    [
      'STT',
      'Giám sát phụ trách',
      'Chức danh',
      'Số công trình phụ trách',
      'Đã báo cáo (tuần chọn)',
      'Chưa báo cáo (tuần chọn)',
      'Có vướng mắc / Cần lưu ý',
      'Tiến độ lũy kế TB (%)',
      'Chiều dài ống phê duyệt (m)',
      'Lũy kế ống đã làm (m)',
      '% Hoàn thành ống',
      'Đánh giá tiến độ cá nhân',
    ],
  ];

  supervisors.forEach((sup, idx) => {
    const supProjects = allProjects.filter((p) => p.supervisorId === sup.id);
    let reported = 0;
    let issues = 0;
    let sumProgress = 0;

    for (const p of supProjects) {
      const repEntry = resolveEffectiveReportForWeek({
        project: p,
        weekId: selectedWeek.id,
        weeks,
        reports,
      });
      const rep = repEntry.report;
      const locked = isProjectReportLocked(p);
      if (rep || locked) {
        reported += 1;
        sumProgress += rep ? rep.cumulativeProgress : 100;
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

    const avg =
      reported > 0 ? Math.round((sumProgress / reported) * 10) / 10 : 0;

    const supEval = evaluateSupervisorProgress({
      supervisorProjects: supProjects,
      weekId: selectedWeek.id,
      weeks,
      reports,
    });

    summaryRows.push([
      idx + 1,
      sup.name,
      sup.role,
      supProjects.length,
      reported,
      supProjects.length - reported,
      issues,
      reported > 0 ? avg : '',
      supEval.totalApprovedM > 0 ? Math.round(supEval.totalApprovedM * 10) / 10 : '',
      supEval.totalApprovedM > 0 ? Math.round(supEval.totalCumulativeM * 10) / 10 : '',
      supEval.pipeCompletionPct !== null ? supEval.pipeCompletionPct : supEval.overallCompletionPct,
      `${supEval.ratingLabel} (${
        supEval.pipeCompletionPct !== null
          ? supEval.pipeCompletionPct
          : supEval.overallCompletionPct
      }%)`,
    ]);
  });

  const unassignedCount = allProjects.filter((p) => !p.supervisorId).length;
  if (unassignedCount > 0) {
    summaryRows.push([
      supervisors.length + 1,
      'Chưa phân công giám sát',
      '—',
      unassignedCount,
      0,
      unassignedCount,
      0,
      '',
      '',
      '',
      '',
      '—',
    ]);
  }

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet['!cols'] = [
    { wch: 5 },
    { wch: 24 },
    { wch: 28 },
    { wch: 22 },
    { wch: 20 },
    { wch: 20 },
    { wch: 24 },
    { wch: 20 },
    { wch: 24 },
    { wch: 22 },
    { wch: 18 },
    { wch: 28 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, allWeeksSheet, 'TongHop_TatCaTuan');
  XLSX.utils.book_append_sheet(
    wb,
    selectedWeekSheet,
    `ChiTiet_${selectedWeek.id}`
  );
  XLSX.utils.book_append_sheet(wb, summarySheet, 'TongHop_GiamSat');

  XLSX.writeFile(wb, `bao-cao-cap-nuoc-tat-ca-tuan.xlsx`);
}

export function exportSupervisorExcel(params: {
  supervisor: Supervisor;
  weeks: WeekPeriod[];
  selectedWeek: WeekPeriod;
  projects: WaterProject[];
  reports: WeeklyReport[];
}) {
  const { supervisor, weeks, selectedWeek, projects, reports } = params;

  const reportByProjectWeek = new Map<string, WeeklyReport>();
  for (const r of reports) {
    reportByProjectWeek.set(`${r.projectId}__${r.weekId}`, r);
  }

  const groupedSections = groupProjectsByCapitalAndArea(projects);

  // Sheet 1: Tất cả các tuần của Giám sát
  const allWeeksRows: (string | number)[][] = [
    [`BÁO CÁO GIÁM SÁT: ${supervisor.name} — TOÀN BỘ CÁC TUẦN`],
    [
      `Chức danh: ${supervisor.role}`,
      '',
      `Số công trình phụ trách: ${projects.length}`,
      '',
      `Ngày xuất: ${formatExportTimestamp()}`,
    ],
    [],
    [
      'STT',
      'Mã công trình',
      'Tên công trình',
      'Nguồn vốn đầu tư',
      'Khu vực',
      'Hạng mục',
      'Tiến độ chung',
      'Lũy kế (Thi công / Phê duyệt)',
      ...weeks.map((w) => `${w.label}\n(${w.dateRange})`),
    ],
  ];

  let supAllIdx = 0;
  for (const section of groupedSections) {
    allWeeksRows.push([
      '',
      section.capitalGroup.toUpperCase(),
      `(${section.totalCount} công trình)`,
    ]);

    for (const area of section.areas) {
      if (shouldRenderAreaSubDivider(section.capitalGroup, area.areaGroup)) {
        allWeeksRows.push([
          '',
          area.areaGroup,
          `(${area.projects.length} công trình)`,
        ]);
      }

      for (const p of area.projects) {
        supAllIdx += 1;
        const weekCells = weeks.map((w) =>
          formatWeekCellContent(reportByProjectWeek.get(`${p.id}__${w.id}`))
        );
        allWeeksRows.push([
          supAllIdx,
          p.code,
          p.name,
          p.capitalGroup,
          p.areaGroup,
          p.category,
          p.targetEndDate,
          p.totalPlannedVolume,
          ...weekCells,
        ]);
      }
    }
  }

  const allWeeksSheet = XLSX.utils.aoa_to_sheet(allWeeksRows);
  allWeeksSheet['!cols'] = [
    { wch: 5 },
    { wch: 14 },
    { wch: 42 },
    { wch: 30 },
    { wch: 24 },
    { wch: 20 },
    { wch: 18 },
    { wch: 32 },
    ...weeks.map(() => ({ wch: 36 })),
  ];

  // Sheet 2: Chi tiết tuần đang chọn
  const selectedRows: (string | number)[][] = [
    [`BÁO CÁO ${selectedWeek.label.toUpperCase()} — GIÁM SÁT: ${supervisor.name}`],
    [
      `Kỳ báo cáo: ${selectedWeek.label} (${selectedWeek.dateRange})`,
      '',
      `Ngày xuất: ${formatExportTimestamp()}`,
    ],
    [],
    [
      'STT',
      'Mã công trình',
      'Tên công trình',
      'Nguồn vốn đầu tư',
      'Khu vực',
      'Hạng mục',
      'Lũy kế kế hoạch',
      'Trạng thái tuần',
      'Tiến độ lũy kế (%)',
      'Tăng tuần (%)',
      'Khối lượng thực hiện tuần',
      'Nội dung công việc chính',
      'Vướng mắc & Đề xuất',
      'Chỉ đạo của lãnh đạo',
      'Cập nhật lúc',
    ],
  ];

  let supWeekIdx = 0;
  for (const section of groupedSections) {
    selectedRows.push([
      '',
      section.capitalGroup.toUpperCase(),
      `(${section.totalCount} công trình)`,
    ]);

    for (const area of section.areas) {
      if (shouldRenderAreaSubDivider(section.capitalGroup, area.areaGroup)) {
        selectedRows.push([
          '',
          area.areaGroup,
          `(${area.projects.length} công trình)`,
        ]);
      }

      for (const p of area.projects) {
        supWeekIdx += 1;
        const repEntry = resolveEffectiveReportForWeek({
          project: p,
          weekId: selectedWeek.id,
          weeks,
          reports,
        });
        const rep = repEntry.report;
        const locked = isProjectReportLocked(p);
        const statusLabel = locked
          ? `${formatStatusLabel(rep?.status ?? 'on_track')} (Đã chốt QT)`
          : formatStatusLabel(rep?.status);

        selectedRows.push([
          supWeekIdx,
          p.code,
          p.name,
          p.capitalGroup,
          p.areaGroup,
          p.category,
          p.totalPlannedVolume,
          statusLabel,
          rep ? rep.cumulativeProgress : '',
          rep ? (repEntry.isCarriedSettled ? 0 : rep.weeklyProgressDelta) : '',
          rep?.weeklyVolume ?? (locked ? 'Đã quyết toán (Chốt báo cáo)' : ''),
          rep?.summary ?? '',
          rep?.issues ?? '',
          rep?.leaderNote ?? '',
          rep?.submittedAt ?? '',
        ]);
      }
    }
  }

  const selectedSheet = XLSX.utils.aoa_to_sheet(selectedRows);
  selectedSheet['!cols'] = [
    { wch: 5 },
    { wch: 14 },
    { wch: 40 },
    { wch: 30 },
    { wch: 24 },
    { wch: 20 },
    { wch: 32 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
    { wch: 36 },
    { wch: 44 },
    { wch: 34 },
    { wch: 32 },
    { wch: 18 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, allWeeksSheet, 'TatCa_CacTuan');
  XLSX.utils.book_append_sheet(wb, selectedSheet, `ChiTiet_${selectedWeek.id}`);

  const safeSlug = supervisor.initials.toLowerCase().replace(/[^a-z0-9]/g, '');
  XLSX.writeFile(
    wb,
    `bao-cao-giam-sat-${safeSlug || 'gs'}-tat-ca-tuan.xlsx`
  );
}
