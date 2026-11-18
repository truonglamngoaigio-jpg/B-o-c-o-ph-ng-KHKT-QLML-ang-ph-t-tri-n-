import * as XLSX from 'xlsx';
import { ProjectCategory, ReportStatus } from '../types';
import { inferProjectGrouping } from './projectGrouping';

export type ImportFieldKey =
  | 'code'
  | 'name'
  | 'capitalGroup'
  | 'areaGroup'
  | 'location'
  | 'category'
  | 'supervisorName'
  | 'budgetBillionVND'
  | 'targetEndDate'
  | 'totalPlannedVolume'
  | 'status'
  | 'cumulativeProgress'
  | 'weeklyProgressDelta'
  | 'weeklyVolume'
  | 'summary'
  | 'issues'
  | 'leaderNote';

export type ColumnMapping = Record<ImportFieldKey, number | null>;

export interface ParsedWorkbookData {
  fileName: string;
  sheetNames: string[];
  sheets: Record<string, string[][]>;
}

export interface ImportedRowItem {
  code: string;
  name: string;
  capitalGroup: string;
  areaGroup: string;
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
}

export function normalizeVietnamese(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export async function parseExcelFile(file: File): Promise<ParsedWorkbookData> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheets: Record<string, string[][]> = {};

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(
      ws,
      {
        header: 1,
        defval: '',
        raw: false,
      }
    );
    sheets[sheetName] = aoa.map((row) =>
      row.map((cell) => String(cell ?? '').trim())
    );
  }

  return {
    fileName: file.name,
    sheetNames: workbook.SheetNames,
    sheets,
  };
}

export function detectHeaderRowIndex(rows: string[][]): number {
  const maxCheck = Math.min(rows.length, 15);
  let bestIdx = 0;
  let bestScore = -1;

  for (let i = 0; i < maxCheck; i++) {
    const row = rows[i];
    const nonEmptyCells = row.filter((c) => c.trim().length > 0);
    if (nonEmptyCells.length < 2) continue;

    let keywordHits = 0;
    for (const cell of nonEmptyCells) {
      const norm = normalizeVietnamese(cell);
      if (
        norm.includes('cong trinh') ||
        norm.includes('ten') ||
        norm.includes('ma ') ||
        norm === 'ma' ||
        norm.includes('giam sat') ||
        norm.includes('tien do') ||
        norm.includes('khu vuc') ||
        norm.includes('dia diem') ||
        norm.includes('khoi luong') ||
        norm.includes('vuong mac')
      ) {
        keywordHits += 2;
      }
    }

    const score = nonEmptyCells.length + keywordHits * 3;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return bestIdx;
}

export function autoDetectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    code: null,
    name: null,
    capitalGroup: null,
    areaGroup: null,
    location: null,
    category: null,
    supervisorName: null,
    budgetBillionVND: null,
    targetEndDate: null,
    totalPlannedVolume: null,
    status: null,
    cumulativeProgress: null,
    weeklyProgressDelta: null,
    weeklyVolume: null,
    summary: null,
    issues: null,
    leaderNote: null,
  };

  const normalizedHeaders = headers.map((h) => normalizeVietnamese(h));

  const matchFirst = (
    matchers: ((h: string) => boolean)[],
    excludeIndices: Set<number>
  ): number | null => {
    for (const matcher of matchers) {
      const idx = normalizedHeaders.findIndex(
        (h, i) => !excludeIndices.has(i) && h.length > 0 && matcher(h)
      );
      if (idx >= 0) {
        excludeIndices.add(idx);
        return idx;
      }
    }
    return null;
  };

  const used = new Set<number>();

  // Priority order avoids colliding "Tên công trình" vs "Mã công trình" vs "Loại công trình"
  mapping.code = matchFirst(
    [
      (h) => h.includes('ma cong trinh') || h.includes('ma ct') || h.includes('ma du an'),
      (h) => h === 'ma' || h === 'code' || h.includes('ma so'),
    ],
    used
  );

  mapping.name = matchFirst(
    [
      (h) => h.includes('ten cong trinh') || h.includes('ten du an'),
      (h) => h === 'cong trinh' || h === 'du an' || h.includes('goi thau'),
      (h) => h.includes('ten') && !h.includes('giam sat'),
    ],
    used
  );

  mapping.capitalGroup = matchFirst(
    [
      (h) => h.includes('nguon von') || h.includes('von dau tu') || h.includes('nhom von'),
    ],
    used
  );

  mapping.areaGroup = matchFirst(
    [
      (h) => h === 'nhom khu vuc' || h.includes('phan khu'),
    ],
    used
  );

  mapping.supervisorName = matchFirst(
    [
      (h) => h.includes('giam sat') || h.includes('phu trach') || h.includes('ky su'),
      (h) => h.includes('nguoi bao cao') || h.includes('can bo'),
    ],
    used
  );

  mapping.location = matchFirst(
    [
      (h) => h.includes('khu vuc') || h.includes('dia diem') || h.includes('dia ban'),
      (h) => h.includes('vi tri') || h.includes('quan') || h.includes('huyen') || h.includes('tinh'),
    ],
    used
  );

  mapping.category = matchFirst(
    [
      (h) => h.includes('hang muc') || h.includes('loai cong trinh') || h.includes('nhom'),
      (h) => h === 'loai',
    ],
    used
  );

  mapping.cumulativeProgress = matchFirst(
    [
      (h) => h.includes('luy ke') || h.includes('tien do (%)') || h.includes('% hoan thanh'),
      (h) => h.includes('tien do') && !h.includes('tuan') && !h.includes('trang thai'),
      (h) => h.includes('hoan thanh (%)') || h.includes('ty le'),
    ],
    used
  );

  mapping.weeklyProgressDelta = matchFirst(
    [
      (h) => h.includes('tang tuan') || h.includes('tien do tuan') || h.includes('% tuan'),
      (h) => h.includes('tang trong tuan'),
    ],
    used
  );

  mapping.status = matchFirst(
    [
      (h) => h.includes('trang thai') || h.includes('tinh trang') || h.includes('danh gia'),
    ],
    used
  );

  mapping.weeklyVolume = matchFirst(
    [
      (h) => h.includes('khoi luong thuc hien') || h.includes('khoi luong tuan') || h.includes('san luong'),
      (h) => h.includes('khoi luong') && !h.includes('thiet ke') && !h.includes('ke hoach'),
    ],
    used
  );

  mapping.summary = matchFirst(
    [
      (h) => h.includes('noi dung bao cao') || h.includes('noi dung cong viec') || h.includes('cong viec chinh'),
      (h) => h.includes('tinh hinh') || h.includes('noi dung') || h.includes('ghi chu') || h.includes('bao cao'),
    ],
    used
  );

  mapping.issues = matchFirst(
    [
      (h) => h.includes('vuong mac') || h.includes('kho khan') || h.includes('kien nghi') || h.includes('ton tai'),
    ],
    used
  );

  mapping.leaderNote = matchFirst(
    [(h) => h.includes('chi dao') || h.includes('lanh dao')],
    used
  );

  mapping.budgetBillionVND = matchFirst(
    [
      (h) => h.includes('tong muc') || h.includes('gia tri') || h.includes('kinh phi') || h.includes('du toan'),
    ],
    used
  );

  mapping.targetEndDate = matchFirst(
    [
      (h) => h.includes('han hoan thanh') || h.includes('ngay hoan thanh') || h.includes('thoi han'),
    ],
    used
  );

  mapping.totalPlannedVolume = matchFirst(
    [
      (h) => h.includes('quy mo') || h.includes('thiet ke') || h.includes('ke hoach'),
    ],
    used
  );

  return mapping;
}

function parseNumber(val: string): number {
  if (!val) return 0;
  const cleaned = val
    .replace(/%/g, '')
    .replace(/\s+/g, '')
    .replace(/,/g, '.');
  const match = cleaned.match(/-?\d+(\.\d+)?/);
  if (!match) return 0;
  const num = Number(match[0]);
  return Number.isFinite(num) ? num : 0;
}

function normalizeCategory(raw: string): ProjectCategory {
  const norm = normalizeVietnamese(raw);
  if (norm.includes('tram bom') || norm.includes('bom') || norm.includes('van')) {
    return 'Trạm bơm tăng áp';
  }
  if (norm.includes('nha may') || norm.includes('xu ly')) {
    return 'Nhà máy xử lý nước';
  }
  if (norm.includes('be chua') || norm.includes('be ') || norm.includes('dieu hoa')) {
    return 'Bể chứa & Điều hòa';
  }
  return 'Tuyến ống cấp nước';
}

function normalizeStatus(
  raw: string,
  hasIssues: boolean
): ReportStatus | 'missing' {
  const norm = normalizeVietnamese(raw);
  if (norm.includes('chua bao cao') || norm.includes('chua nop')) {
    return 'missing';
  }
  if (norm.includes('cham') || norm.includes('tre') || norm.includes('ngung')) {
    return 'delayed';
  }
  if (norm.includes('luu y') || norm.includes('canh bao') || norm.includes('vuong')) {
    return 'attention';
  }
  if (norm.includes('dung') || norm.includes('dat') || norm.includes('on dinh') || norm.includes('tot')) {
    return 'on_track';
  }
  return hasIssues ? 'attention' : 'on_track';
}

export function buildImportedRows(
  rows: string[][],
  headerRowIndex: number,
  mapping: ColumnMapping
): ImportedRowItem[] {
  if (mapping.name === null) return [];

  const result: ImportedRowItem[] = [];
  let autoSeq = 1;

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c.trim() === '')) continue;

    const getCell = (colIdx: number | null) =>
      colIdx !== null && colIdx >= 0 && colIdx < row.length
        ? row[colIdx].trim()
        : '';

    const rawName = getCell(mapping.name);
    if (!rawName) continue;

    // Skip summary/total footer rows
    const normName = normalizeVietnamese(rawName);
    if (
      normName.startsWith('tong cong') ||
      normName === 'tong' ||
      normName.startsWith('cong:')
    ) {
      continue;
    }

    const rawCode = getCell(mapping.code);
    const code =
      rawCode && !/^\d+$/.test(rawCode)
        ? rawCode
        : `CN-${String(autoSeq).padStart(2, '0')}`;
    autoSeq += 1;

    const rawCapitalGroup = getCell(mapping.capitalGroup);
    const rawAreaGroup = getCell(mapping.areaGroup);
    const rawLocation = getCell(mapping.location);
    const rawCategory = getCell(mapping.category);
    const rawSupervisor = getCell(mapping.supervisorName);
    const supervisorName =
      rawSupervisor &&
      !normalizeVietnamese(rawSupervisor).includes('chua phan cong')
        ? rawSupervisor
        : null;

    const inferredGrouping = inferProjectGrouping(code, rawLocation);

    const rawBudget = getCell(mapping.budgetBillionVND);
    const rawTargetDate = getCell(mapping.targetEndDate);
    const rawPlannedVol = getCell(mapping.totalPlannedVolume);

    const rawStatus = getCell(mapping.status);
    const rawCumProgress = getCell(mapping.cumulativeProgress);
    const rawDelta = getCell(mapping.weeklyProgressDelta);
    const rawWeeklyVol = getCell(mapping.weeklyVolume);
    const rawSummary = getCell(mapping.summary);
    const rawIssues = getCell(mapping.issues);
    const rawLeaderNote = getCell(mapping.leaderNote);

    const parsedStatus = normalizeStatus(rawStatus, Boolean(rawIssues));
    const hasAnyReportMetric =
      rawCumProgress !== '' ||
      rawDelta !== '' ||
      rawWeeklyVol !== '' ||
      rawSummary !== '' ||
      rawIssues !== '' ||
      (rawStatus !== '' && parsedStatus !== 'missing');

    const cumulativeProgress = Math.max(
      0,
      Math.min(100, parseNumber(rawCumProgress))
    );
    const weeklyProgressDelta = Math.max(
      0,
      Math.min(100, parseNumber(rawDelta))
    );

    result.push({
      code,
      name: rawName,
      capitalGroup: rawCapitalGroup || inferredGrouping.capitalGroup,
      areaGroup: rawAreaGroup || inferredGrouping.areaGroup,
      location: rawLocation || 'Đang cập nhật',
      category: normalizeCategory(rawCategory),
      supervisorName,
      budgetBillionVND: parseNumber(rawBudget),
      targetEndDate: rawTargetDate || 'Đang cập nhật',
      totalPlannedVolume: rawPlannedVol || 'Theo hồ sơ thiết kế',
      hasReportData: hasAnyReportMetric && parsedStatus !== 'missing',
      status: parsedStatus === 'missing' ? 'on_track' : parsedStatus,
      cumulativeProgress,
      weeklyProgressDelta,
      weeklyVolume: rawWeeklyVol || rawSummary,
      summary: rawSummary || rawWeeklyVol || 'Đã cập nhật từ file Excel.',
      issues: rawIssues,
      leaderNote: rawLeaderNote,
    });
  }

  return result;
}

export function downloadExcelTemplate() {
  const rows = [
    [
      'Mã công trình',
      'Tên công trình',
      'Khu vực',
      'Hạng mục',
      'Giám sát phụ trách',
      'Trạng thái tuần',
      'Tiến độ lũy kế (%)',
      'Tăng tuần (%)',
      'Khối lượng thực hiện tuần',
      'Nội dung báo cáo chính',
      'Vướng mắc / Kiến nghị',
      'Tổng mức ĐT (tỷ đ)',
      'Hạn hoàn thành',
    ],
    [
      'CN-01',
      'Tuyến ống cấp nước D300 Khu vực Đông',
      'TP. Thủ Đức',
      'Tuyến ống cấp nước',
      'KS. Trần Minh Quân',
      'Đúng tiến độ',
      65,
      5,
      '300 m ống HDPE D300',
      'Thi công lắp đặt và thử áp đoạn tuyến chính đạt yêu cầu.',
      '',
      18.5,
      '30/12/2026',
    ],
    [
      'CN-02',
      'Trạm bơm tăng áp Bình Chánh',
      'H. Bình Chánh',
      'Trạm bơm tăng áp',
      'KS. Nguyễn Hoàng Anh',
      'Cần lưu ý',
      48,
      3.5,
      'Lắp đặt 2 bệ bơm và tủ điều khiển',
      'Hoàn thiện phần cơ khí, chờ đấu nối điện trung thế.',
      'Chờ cấp phép cắt điện đấu nối từ Điện lực.',
      32.0,
      '15/01/2027',
    ],
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 14 },
    { wch: 36 },
    { wch: 20 },
    { wch: 20 },
    { wch: 24 },
    { wch: 16 },
    { wch: 18 },
    { wch: 14 },
    { wch: 30 },
    { wch: 40 },
    { wch: 32 },
    { wch: 16 },
    { wch: 15 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Mau_Nhap_Cong_Trinh');
  XLSX.writeFile(wb, 'mau-import-cong-trinh-cap-nuoc.xlsx');
}
