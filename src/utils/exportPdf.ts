import { jsPDF } from 'jspdf';
import autoTable, { RowInput } from 'jspdf-autotable';
import dejavuRegularUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url';
import dejavuBoldUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf?url';
import {
  ReportStatus,
  Supervisor,
  WaterProject,
  WeekPeriod,
  WeeklyReport,
} from '../types';
import {
  groupProjectsByCapitalAndArea,
  shouldRenderAreaSubDivider,
} from './projectGrouping';
import {
  EffectiveWeekReport,
  isProjectReportLocked,
  resolveEffectiveReportForWeek,
} from './projectLock';

export interface PdfColumnSpec {
  label: string;
  widthMm: number;
  align?: 'left' | 'center' | 'right';
}

export type PdfTableRow =
  | { kind: 'capital'; label: string }
  | { kind: 'area'; label: string }
  | {
      kind: 'project';
      cells: [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ];
      statusTone: ReportStatus | 'missing';
      isLocked: boolean;
    };

export interface PdfReportModel {
  fileName: string;
  title: string;
  subtitleLine1: string;
  subtitleLine2: string;
  footerLeft: string;
  projectCount: number;
  columns: PdfColumnSpec[];
  rows: PdfTableRow[];
}

export interface BuiltPdfResult {
  doc: jsPDF;
  pageCount: number;
  fileName: string;
}

let cachedRegularBase64: string | null = null;
let cachedBoldBase64: string | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function ensureVietnameseFonts(doc: jsPDF): Promise<void> {
  if (!cachedRegularBase64 || !cachedBoldBase64) {
    const [regRes, boldRes] = await Promise.all([
      fetch(dejavuRegularUrl),
      fetch(dejavuBoldUrl),
    ]);
    if (!regRes.ok || !boldRes.ok) {
      throw new Error('Không thể tải font tiếng Việt để xuất PDF.');
    }
    const [regBuf, boldBuf] = await Promise.all([
      regRes.arrayBuffer(),
      boldRes.arrayBuffer(),
    ]);
    cachedRegularBase64 = arrayBufferToBase64(regBuf);
    cachedBoldBase64 = arrayBufferToBase64(boldBuf);
  }

  doc.addFileToVFS('DejaVuSans.ttf', cachedRegularBase64);
  doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf', cachedBoldBase64);
  doc.addFont('DejaVuSans-Bold.ttf', 'DejaVuSans', 'bold');
  doc.setFont('DejaVuSans', 'normal');
}

function formatStatusLabel(status: WeeklyReport['status'] | undefined): string {
  if (status === 'on_track') return 'Đúng tiến độ';
  if (status === 'attention') return 'Cần lưu ý';
  if (status === 'delayed') return 'Chậm tiến độ';
  return 'Chưa báo cáo';
}

function formatTimestamp(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function addPageNumbers(doc: jsPDF, footerLeft: string) {
  const totalPages = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('DejaVuSans', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(footerLeft, 12, pageHeight - 7);
    doc.text(`Trang ${i} / ${totalPages}`, pageWidth - 12, pageHeight - 7, {
      align: 'right',
    });
  }
}

export function prepareLeadershipPdfModel(params: {
  weeks?: WeekPeriod[];
  selectedWeek: WeekPeriod;
  projects: WaterProject[];
  supervisors: Supervisor[];
  reports: WeeklyReport[];
}): PdfReportModel {
  const { weeks, selectedWeek, projects, supervisors, reports } = params;
  const resolvedWeeks = weeks && weeks.length > 0 ? weeks : [selectedWeek];

  const supervisorMap = new Map<string, Supervisor>();
  for (const s of supervisors) {
    supervisorMap.set(s.id, s);
  }

  const reportByProject = new Map<string, EffectiveWeekReport>();
  for (const p of projects) {
    reportByProject.set(
      p.id,
      resolveEffectiveReportForWeek({
        project: p,
        weekId: selectedWeek.id,
        weeks: resolvedWeeks,
        reports,
      })
    );
  }

  let reportedCount = 0;
  let issueCount = 0;
  let progressSum = 0;
  for (const p of projects) {
    const rep = reportByProject.get(p.id)?.report;
    const locked = isProjectReportLocked(p);
    if (rep || locked) {
      reportedCount += 1;
      progressSum += rep ? rep.cumulativeProgress : 100;
      if (
        rep &&
        (rep.status === 'attention' || rep.status === 'delayed' || rep.issues)
      ) {
        issueCount += 1;
      }
    }
  }
  const avgProgress =
    reportedCount > 0 ? Math.round((progressSum / reportedCount) * 10) / 10 : 0;
  const reportRate =
    projects.length > 0 ? Math.round((reportedCount / projects.length) * 100) : 0;

  const timestamp = formatTimestamp();
  const groupedSections = groupProjectsByCapitalAndArea(projects);
  const rows: PdfTableRow[] = [];
  let rowNum = 0;

  for (const section of groupedSections) {
    rows.push({
      kind: 'capital',
      label: `${section.capitalGroup.toUpperCase()}  (${section.totalCount} công trình)`,
    });

    for (const area of section.areas) {
      if (shouldRenderAreaSubDivider(section.capitalGroup, area.areaGroup)) {
        rows.push({
          kind: 'area',
          label: `${area.areaGroup}  (${area.projects.length} công trình)`,
        });
      }

      for (const p of area.projects) {
        rowNum += 1;
        const repEntry = reportByProject.get(p.id);
        const rep = repEntry?.report;
        const isLocked = isProjectReportLocked(p);
        const supName = p.supervisorId
          ? supervisorMap.get(p.supervisorId)?.name ?? 'Chưa phân công'
          : 'Chưa phân công';

        const mainWork = rep
          ? [
              rep.weeklyVolume,
              rep.summary && rep.summary !== rep.weeklyVolume ? rep.summary : '',
            ]
              .filter(Boolean)
              .join('\n')
          : isLocked
            ? 'Đã quyết toán (Chốt báo cáo)'
            : 'Chưa nộp báo cáo tuần này';

        const notesAndIssues = rep
          ? [
              rep.issues ? `Vướng mắc: ${rep.issues}` : '',
              rep.leaderNote ? `Chỉ đạo: ${rep.leaderNote}` : '',
            ]
              .filter(Boolean)
              .join('\n') || '—'
          : '—';

        const resolvedStatus: ReportStatus | 'missing' = isLocked
          ? rep?.status ?? 'on_track'
          : rep?.status ?? 'missing';

        const stageLabel = rep?.projectStage || (isLocked ? 'ĐÃ QUYẾT TOÁN' : '');
        const statusCell = isLocked
          ? `${stageLabel || formatStatusLabel(rep?.status ?? 'on_track')}\n(Đã chốt QT)`
          : stageLabel || formatStatusLabel(rep?.status);

        rows.push({
          kind: 'project',
          statusTone: resolvedStatus,
          isLocked,
          cells: [
            String(rowNum),
            p.code,
            `${p.name}\n(${p.location} · ${p.category})`,
            supName,
            statusCell,
            rep
              ? `${rep.cumulativeProgress}%${
                  !repEntry?.isCarriedSettled && rep.weeklyProgressDelta > 0
                    ? `\n(+${rep.weeklyProgressDelta}%)`
                    : ''
                }`
              : '—',
            mainWork,
            notesAndIssues,
          ],
        });
      }
    }
  }

  return {
    fileName: `bao-cao-tong-hop-${selectedWeek.id}.pdf`,
    title: 'KHKT&QLML BTW — BÁO CÁO TỔNG HỢP CÔNG TRÌNH CẤP NƯỚC',
    subtitleLine1: `Kỳ báo cáo: ${selectedWeek.label} (${selectedWeek.dateRange})   ·   Ngày xuất: ${timestamp}`,
    subtitleLine2: `Tổng công trình: ${projects.length}   ·   Đã báo cáo: ${reportedCount}/${projects.length} (${reportRate}%)   ·   Tiến độ TB: ${avgProgress}%   ·   Cần lưu ý / Vướng mắc: ${issueCount}`,
    footerLeft: `KHKT&QLML BTW · Báo cáo tổng hợp ${selectedWeek.label}`,
    projectCount: projects.length,
    columns: [
      { label: 'STT', widthMm: 10, align: 'center' },
      { label: 'Mã CT', widthMm: 22 },
      { label: 'Công trình & Khu vực', widthMm: 62 },
      { label: 'Giám sát', widthMm: 22 },
      { label: 'Trạng thái', widthMm: 24 },
      { label: 'Tiến độ', widthMm: 18, align: 'right' },
      { label: `Khối lượng & Nội dung (${selectedWeek.label})`, widthMm: 68 },
      { label: 'Vướng mắc / Chỉ đạo', widthMm: 47 },
    ],
    rows,
  };
}

export function prepareSupervisorPdfModel(params: {
  supervisor: Supervisor;
  weeks?: WeekPeriod[];
  selectedWeek: WeekPeriod;
  projects: WaterProject[];
  reports: WeeklyReport[];
}): PdfReportModel {
  const { supervisor, weeks, selectedWeek, projects, reports } = params;
  const resolvedWeeks = weeks && weeks.length > 0 ? weeks : [selectedWeek];

  const reportByProject = new Map<string, EffectiveWeekReport>();
  for (const p of projects) {
    reportByProject.set(
      p.id,
      resolveEffectiveReportForWeek({
        project: p,
        weekId: selectedWeek.id,
        weeks: resolvedWeeks,
        reports,
      })
    );
  }

  let submitted = 0;
  let issues = 0;
  for (const p of projects) {
    const rep = reportByProject.get(p.id)?.report;
    const locked = isProjectReportLocked(p);
    if (rep || locked) {
      submitted += 1;
      if (
        rep &&
        (rep.status === 'attention' || rep.status === 'delayed' || rep.issues)
      ) {
        issues += 1;
      }
    }
  }
  const pending = projects.length - submitted;
  const timestamp = formatTimestamp();

  const groupedSections = groupProjectsByCapitalAndArea(projects);
  const rows: PdfTableRow[] = [];
  let rowNum = 0;

  for (const section of groupedSections) {
    rows.push({
      kind: 'capital',
      label: `${section.capitalGroup.toUpperCase()}  (${section.totalCount} công trình)`,
    });

    for (const area of section.areas) {
      if (shouldRenderAreaSubDivider(section.capitalGroup, area.areaGroup)) {
        rows.push({
          kind: 'area',
          label: `${area.areaGroup}  (${area.projects.length} công trình)`,
        });
      }

      for (const p of area.projects) {
        rowNum += 1;
        const repEntry = reportByProject.get(p.id);
        const rep = repEntry?.report;
        const isLocked = isProjectReportLocked(p);
        const workSummary = rep
          ? [
              rep.weeklyVolume,
              rep.summary && rep.summary !== rep.weeklyVolume ? rep.summary : '',
            ]
              .filter(Boolean)
              .join('\n')
          : isLocked
            ? 'Đã quyết toán (Chốt báo cáo)'
            : 'Chưa nộp báo cáo';

        const issuesAndDirective = rep
          ? [
              rep.issues ? `Vướng mắc: ${rep.issues}` : '',
              rep.leaderNote ? `Chỉ đạo: ${rep.leaderNote}` : '',
            ]
              .filter(Boolean)
              .join('\n') || '—'
          : '—';

        const resolvedStatus: ReportStatus | 'missing' = isLocked
          ? rep?.status ?? 'on_track'
          : rep?.status ?? 'missing';

        const stageLabel = rep?.projectStage || (isLocked ? 'ĐÃ QUYẾT TOÁN' : '');
        const statusCell = isLocked
          ? `${stageLabel || formatStatusLabel(rep?.status ?? 'on_track')}\n(Đã chốt QT)`
          : stageLabel || formatStatusLabel(rep?.status);

        rows.push({
          kind: 'project',
          statusTone: resolvedStatus,
          isLocked,
          cells: [
            String(rowNum),
            p.code,
            `${p.name}\n(${p.location})`,
            p.totalPlannedVolume,
            statusCell,
            rep
              ? `${rep.cumulativeProgress}%${
                  !repEntry?.isCarriedSettled && rep.weeklyProgressDelta > 0
                    ? `\n(+${rep.weeklyProgressDelta}%)`
                    : ''
                }`
              : '—',
            workSummary,
            issuesAndDirective,
          ],
        });
      }
    }
  }

  const safeSlug = supervisor.initials.toLowerCase().replace(/[^a-z0-9]/g, '');

  return {
    fileName: `bao-cao-giam-sat-${safeSlug || 'gs'}-${selectedWeek.id}.pdf`,
    title: `KHKT&QLML BTW — BÁO CÁO TUẦN GIÁM SÁT: ${supervisor.name.toUpperCase()}`,
    subtitleLine1: `Chức danh: ${supervisor.role}   ·   Kỳ báo cáo: ${selectedWeek.label} (${selectedWeek.dateRange})   ·   Ngày xuất: ${timestamp}`,
    subtitleLine2: `Phụ trách: ${projects.length} công trình   ·   Đã báo cáo: ${submitted}   ·   Chờ nộp: ${pending}   ·   Vướng mắc: ${issues}`,
    footerLeft: `KHKT&QLML BTW · Giám sát ${supervisor.name} · ${selectedWeek.label}`,
    projectCount: projects.length,
    columns: [
      { label: 'STT', widthMm: 10, align: 'center' },
      { label: 'Mã CT', widthMm: 22 },
      { label: 'Công trình & Khu vực', widthMm: 56 },
      { label: 'Quy mô / Lũy kế', widthMm: 38 },
      { label: 'Trạng thái', widthMm: 24 },
      { label: 'Tiến độ', widthMm: 18, align: 'right' },
      { label: `Khối lượng & Công việc (${selectedWeek.label})`, widthMm: 62 },
      { label: 'Vướng mắc / Chỉ đạo', widthMm: 43 },
    ],
    rows,
  };
}

export async function buildPdfFromModel(
  model: PdfReportModel
): Promise<BuiltPdfResult> {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  await ensureVietnameseFonts(doc);

  doc.setFont('DejaVuSans', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(model.title, 12, 14);

  doc.setFont('DejaVuSans', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(model.subtitleLine1, 12, 20);
  doc.text(model.subtitleLine2, 12, 25.5);

  const bodyRows: RowInput[] = model.rows.map((row) => {
    if (row.kind === 'capital') {
      return [
        {
          content: row.label,
          colSpan: 8,
          styles: {
            fillColor: [226, 232, 240],
            textColor: [15, 23, 42],
            fontStyle: 'bold',
            fontSize: 8,
            cellPadding: { top: 2.2, right: 2.5, bottom: 2.2, left: 2.5 },
          },
        },
      ];
    }
    if (row.kind === 'area') {
      return [
        {
          content: row.label,
          colSpan: 8,
          styles: {
            fillColor: [239, 246, 255],
            textColor: [3, 105, 161],
            fontStyle: 'bold',
            fontSize: 7.5,
            cellPadding: { top: 1.8, right: 2.5, bottom: 1.8, left: 5 },
          },
        },
      ];
    }
    return row.cells;
  });

  const columnStyles: Record<
    number,
    { cellWidth: number; halign?: 'left' | 'center' | 'right' }
  > = {};
  model.columns.forEach((col, idx) => {
    columnStyles[idx] = {
      cellWidth: col.widthMm,
      ...(col.align ? { halign: col.align } : {}),
    };
  });

  autoTable(doc, {
    startY: 30,
    margin: { left: 12, right: 12, bottom: 14 },
    head: [model.columns.map((c) => c.label)],
    body: bodyRows,
    styles: {
      font: 'DejaVuSans',
      fontSize: 7.5,
      cellPadding: 2.2,
      textColor: [15, 23, 42],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      valign: 'top',
      overflow: 'linebreak',
    },
    headStyles: {
      font: 'DejaVuSans',
      fontStyle: 'bold',
      fontSize: 8,
      fillColor: [3, 105, 161],
      textColor: [255, 255, 255],
      valign: 'middle',
    },
    columnStyles,
  });

  addPageNumbers(doc, model.footerLeft);

  return {
    doc,
    pageCount: doc.getNumberOfPages(),
    fileName: model.fileName,
  };
}

export async function exportLeadershipPdf(params: {
  weeks?: WeekPeriod[];
  selectedWeek: WeekPeriod;
  projects: WaterProject[];
  supervisors: Supervisor[];
  reports: WeeklyReport[];
}): Promise<void> {
  const model = prepareLeadershipPdfModel(params);
  const { doc, fileName } = await buildPdfFromModel(model);
  doc.save(fileName);
}

export async function exportSupervisorPdf(params: {
  supervisor: Supervisor;
  weeks?: WeekPeriod[];
  selectedWeek: WeekPeriod;
  projects: WaterProject[];
  reports: WeeklyReport[];
}): Promise<void> {
  const model = prepareSupervisorPdfModel(params);
  const { doc, fileName } = await buildPdfFromModel(model);
  doc.save(fileName);
}
