import { useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
  X,
} from 'lucide-react';
import { WeekPeriod } from '../types';
import {
  autoDetectColumnMapping,
  buildImportedRows,
  ColumnMapping,
  detectHeaderRowIndex,
  downloadExcelTemplate,
  ImportedRowItem,
  ImportFieldKey,
  parseExcelFile,
  ParsedWorkbookData,
} from '../utils/importExcel';

interface ImportExcelModalProps {
  isOpen: boolean;
  weeks: WeekPeriod[];
  defaultWeekId: string;
  onClose: () => void;
  onConfirmImport: (params: {
    rows: ImportedRowItem[];
    weekId: string;
    mode: 'replace' | 'merge';
  }) => void;
}

const FIELD_DEFS: {
  key: ImportFieldKey;
  label: string;
  required?: boolean;
}[] = [
  { key: 'name', label: 'Tên công trình', required: true },
  { key: 'code', label: 'Mã công trình' },
  { key: 'capitalGroup', label: 'Nguồn vốn đầu tư' },
  { key: 'areaGroup', label: 'Nhóm khu vực' },
  { key: 'supervisorName', label: 'Giám sát phụ trách' },
  { key: 'location', label: 'Địa điểm chi tiết' },
  { key: 'category', label: 'Hạng mục / Loại' },
  { key: 'cumulativeProgress', label: 'Tiến độ lũy kế (%)' },
  { key: 'weeklyProgressDelta', label: 'Tăng trong tuần (%)' },
  { key: 'status', label: 'Trạng thái tuần' },
  { key: 'weeklyVolume', label: 'Khối lượng tuần' },
  { key: 'summary', label: 'Nội dung báo cáo' },
  { key: 'issues', label: 'Vướng mắc / Kiến nghị' },
  { key: 'budgetBillionVND', label: 'Tổng mức ĐT (tỷ đ)' },
  { key: 'targetEndDate', label: 'Hạn hoàn thành' },
];

export function ImportExcelModal({
  isOpen,
  weeks,
  defaultWeekId,
  onClose,
  onConfirmImport,
}: ImportExcelModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [workbookData, setWorkbookData] = useState<ParsedWorkbookData | null>(
    null
  );
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [headerRowIndex, setHeaderRowIndex] = useState<number>(0);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [targetWeekId, setTargetWeekId] = useState<string>(defaultWeekId);
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace');
  const [error, setError] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const currentSheetRows = useMemo(() => {
    if (!workbookData || !selectedSheet) return [];
    return workbookData.sheets[selectedSheet] ?? [];
  }, [workbookData, selectedSheet]);

  const headerCells = useMemo(() => {
    return currentSheetRows[headerRowIndex] ?? [];
  }, [currentSheetRows, headerRowIndex]);

  const parsedPreviewRows = useMemo(() => {
    if (!mapping || currentSheetRows.length === 0) return [];
    return buildImportedRows(currentSheetRows, headerRowIndex, mapping);
  }, [currentSheetRows, headerRowIndex, mapping]);

  const uniqueSupervisorNames = useMemo(() => {
    const set = new Set<string>();
    for (const r of parsedPreviewRows) {
      if (r.supervisorName) set.add(r.supervisorName);
    }
    return Array.from(set);
  }, [parsedPreviewRows]);

  if (!isOpen) return null;

  const loadFile = async (file: File) => {
    setError('');
    try {
      const parsed = await parseExcelFile(file);
      if (parsed.sheetNames.length === 0) {
        setError('File Excel không có sheet dữ liệu nào.');
        return;
      }
      const firstSheet = parsed.sheetNames[0];
      const rows = parsed.sheets[firstSheet] ?? [];
      const detectedHeaderIdx = detectHeaderRowIndex(rows);
      const detectedMapping = autoDetectColumnMapping(
        rows[detectedHeaderIdx] ?? []
      );

      setWorkbookData(parsed);
      setSelectedSheet(firstSheet);
      setHeaderRowIndex(detectedHeaderIdx);
      setMapping(detectedMapping);
      setTargetWeekId(defaultWeekId);
    } catch {
      setError(
        'Không thể đọc file này. Vui lòng chọn file định dạng .xlsx, .xls hoặc .csv hợp lệ.'
      );
    }
  };

  const handleSheetChange = (sheetName: string) => {
    if (!workbookData) return;
    const rows = workbookData.sheets[sheetName] ?? [];
    const detectedHeaderIdx = detectHeaderRowIndex(rows);
    const detectedMapping = autoDetectColumnMapping(
      rows[detectedHeaderIdx] ?? []
    );
    setSelectedSheet(sheetName);
    setHeaderRowIndex(detectedHeaderIdx);
    setMapping(detectedMapping);
  };

  const handleHeaderRowChange = (nextIdx: number) => {
    const rows = currentSheetRows;
    const safeIdx = Math.max(0, Math.min(rows.length - 1, nextIdx));
    setHeaderRowIndex(safeIdx);
    setMapping(autoDetectColumnMapping(rows[safeIdx] ?? []));
  };

  const handleConfirm = () => {
    if (!mapping || mapping.name === null) {
      setError('Vui lòng chọn cột tương ứng cho "Tên công trình".');
      return;
    }
    if (parsedPreviewRows.length === 0) {
      setError(
        'Không tìm thấy dòng công trình hợp lệ nào dưới dòng tiêu đề đã chọn.'
      );
      return;
    }

    onConfirmImport({
      rows: parsedPreviewRows,
      weekId: targetWeekId,
      mode: importMode,
    });
    setWorkbookData(null);
    setMapping(null);
    setError('');
    onClose();
  };

  const handleResetAndClose = () => {
    setWorkbookData(null);
    setMapping(null);
    setError('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="Nhập dữ liệu từ file Excel"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-4xl max-h-[90vh] shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Nhập số liệu công trình từ Excel (.xlsx / .xls / .csv)
              </h2>
              <p className="text-xs text-slate-500">
                Hệ thống tự nhận diện cột và tự tạo tab riêng cho từng giám sát có trong file.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleResetAndClose}
            aria-label="Đóng"
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* File Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void loadFile(file);
            }}
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              isDragging
                ? 'border-sky-600 bg-sky-50/70'
                : 'border-slate-300 bg-slate-50/60'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void loadFile(file);
                e.target.value = '';
              }}
            />

            <Upload className="w-7 h-7 text-sky-700 mx-auto mb-2" />
            {workbookData ? (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">
                  Đã tải file: {workbookData.fileName}
                </p>
                <p className="text-xs text-slate-500">
                  Tìm thấy {parsedPreviewRows.length} công trình ·{' '}
                  {uniqueSupervisorNames.length} giám sát phụ trách
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-sky-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md"
                >
                  Chọn file khác
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-800">
                  Kéo thả file Excel vào đây hoặc bấm nút bên dưới để chọn file từ máy tính
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-9 px-4 inline-flex items-center gap-2 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Chọn file Excel (.xlsx)</span>
                  </button>
                  <button
                    type="button"
                    onClick={downloadExcelTemplate}
                    className="h-9 px-3.5 inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>Tải file mẫu tham khảo</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-800">
              {error}
            </div>
          )}

          {/* Column Mapping & Import Options */}
          {workbookData && mapping && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Sheet dữ liệu
                  </label>
                  <select
                    value={selectedSheet}
                    onChange={(e) => handleSheetChange(e.target.value)}
                    className="w-full h-9 px-2.5 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg"
                  >
                    {workbookData.sheetNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Dòng tiêu đề cột
                  </label>
                  <select
                    value={headerRowIndex}
                    onChange={(e) =>
                      handleHeaderRowChange(Number(e.target.value))
                    }
                    className="w-full h-9 px-2.5 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg"
                  >
                    {currentSheetRows.slice(0, 12).map((row, idx) => {
                      const preview = row
                        .filter(Boolean)
                        .slice(0, 3)
                        .join(' | ');
                      return (
                        <option key={idx} value={idx}>
                          Dòng {idx + 1}: {preview || '(Trống)'}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tuần áp dụng số liệu
                  </label>
                  <select
                    value={targetWeekId}
                    onChange={(e) => setTargetWeekId(e.target.value)}
                    className="w-full h-9 px-2.5 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg"
                  >
                    {weeks.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.label} ({w.dateRange})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Chế độ nhập
                  </label>
                  <select
                    value={importMode}
                    onChange={(e) =>
                      setImportMode(e.target.value as 'replace' | 'merge')
                    }
                    className="w-full h-9 px-2.5 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="replace">
                      Thay thế dữ liệu mẫu bằng file này
                    </option>
                    <option value="merge">
                      Gộp thêm vào danh sách hiện có
                    </option>
                  </select>
                </div>
              </div>

              {/* Field Mapping Grid */}
              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-slate-900">
                    Ghép cột trong file Excel với hệ thống
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    Tự động nhận diện — bạn có thể chỉnh lại nếu tên cột khác
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {FIELD_DEFS.map((field) => {
                    const currentVal = mapping[field.key];
                    return (
                      <div key={field.key}>
                        <label className="block text-[11px] font-medium text-slate-700 mb-1">
                          {field.label}
                          {field.required && (
                            <span className="text-red-600 ml-0.5">*</span>
                          )}
                        </label>
                        <select
                          value={currentVal === null ? '' : String(currentVal)}
                          onChange={(e) => {
                            const val =
                              e.target.value === ''
                                ? null
                                : Number(e.target.value);
                            setMapping((prev) =>
                              prev ? { ...prev, [field.key]: val } : prev
                            );
                          }}
                          className={`w-full h-8 px-2 text-xs rounded-md border bg-white ${
                            field.required && currentVal === null
                              ? 'border-red-400 text-red-900'
                              : 'border-slate-300 text-slate-900'
                          }`}
                        >
                          <option value="">-- Bỏ qua --</option>
                          {headerCells.map((h, idx) => (
                            <option key={idx} value={idx}>
                              Cột {idx + 1}: {h || `(Trống)`}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Live Preview Table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-slate-900">
                    Xem trước dữ liệu sẽ nhập ({parsedPreviewRows.length} công trình)
                  </h3>
                  {uniqueSupervisorNames.length > 0 && (
                    <span className="text-[11px] text-emerald-700 font-medium inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>
                        Sẽ phân về {uniqueSupervisorNames.length} tab giám sát
                      </span>
                    </span>
                  )}
                </div>

                <div className="border border-slate-200 rounded-lg overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs min-w-[680px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                        <th className="py-2 px-3">Mã</th>
                        <th className="py-2 px-3">Tên công trình</th>
                        <th className="py-2 px-3">Giám sát</th>
                        <th className="py-2 px-3 text-right">Tiến độ</th>
                        <th className="py-2 px-3">Nội dung / Khối lượng</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {parsedPreviewRows.slice(0, 6).map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-mono text-sky-700 whitespace-nowrap">
                            {row.code}
                          </td>
                          <td className="py-2 px-3 font-medium text-slate-900">
                            {row.name}
                          </td>
                          <td className="py-2 px-3 text-slate-700 whitespace-nowrap">
                            {row.supervisorName ?? (
                              <span className="text-amber-700">
                                Chưa phân công
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-900">
                            {row.hasReportData
                              ? `${row.cumulativeProgress}%`
                              : '—'}
                          </td>
                          <td className="py-2 px-3 text-slate-600 max-w-[240px] truncate">
                            {row.hasReportData
                              ? row.weeklyVolume || row.summary
                              : 'Chưa có báo cáo tuần'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsedPreviewRows.length > 6 && (
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    Và {parsedPreviewRows.length - 6} công trình khác...
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleResetAndClose}
            className="h-9 px-4 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
          >
            Đóng
          </button>
          <button
            type="button"
            disabled={!workbookData || parsedPreviewRows.length === 0}
            onClick={handleConfirm}
            className="h-9 px-4 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 disabled:opacity-45 disabled:pointer-events-none rounded-lg"
          >
            Xác nhận nhập ({parsedPreviewRows.length} công trình)
          </button>
        </div>
      </div>
    </div>
  );
}
