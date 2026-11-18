import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  FileDown,
  FileText,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  BuiltPdfResult,
  PdfReportModel,
  buildPdfFromModel,
} from '../utils/exportPdf';

interface PdfPreviewModalProps {
  isOpen: boolean;
  model: PdfReportModel | null;
  onClose: () => void;
}

const ZOOM_STEPS = [0.75, 0.9, 1, 1.15] as const;

export function PdfPreviewModal({
  isOpen,
  model,
  onClose,
}: PdfPreviewModalProps) {
  const [zoomIndex, setZoomIndex] = useState<number>(2); // 100%
  const [builtPdf, setBuiltPdf] = useState<BuiltPdfResult | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [justDownloaded, setJustDownloaded] = useState(false);

  const zoom = ZOOM_STEPS[zoomIndex] ?? 1;

  useEffect(() => {
    if (!isOpen || !model) {
      setBuiltPdf(null);
      setBuildError(null);
      setJustDownloaded(false);
      return;
    }

    let cancelled = false;
    setIsBuilding(true);
    setBuildError(null);
    setJustDownloaded(false);

    buildPdfFromModel(model)
      .then((result) => {
        if (!cancelled) {
          setBuiltPdf(result);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setBuildError(
            err instanceof Error
              ? err.message
              : 'Không thể khởi tạo tệp PDF để xem trước.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsBuilding(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, model]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !model) return null;

  const totalWidthMm = model.columns.reduce((sum, c) => sum + c.widthMm, 0);

  const handleDownloadPdf = async () => {
    if (builtPdf) {
      builtPdf.doc.save(builtPdf.fileName);
      setJustDownloaded(true);
      return;
    }
    setIsBuilding(true);
    setBuildError(null);
    try {
      const result = await buildPdfFromModel(model);
      setBuiltPdf(result);
      result.doc.save(result.fileName);
      setJustDownloaded(true);
    } catch (err) {
      setBuildError(
        err instanceof Error ? err.message : 'Không thể xuất file PDF.'
      );
    } finally {
      setIsBuilding(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-review-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-[1260px] h-[92vh] bg-white border border-blue-200 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Top Review Toolbar */}
        <header className="px-4 sm:px-6 py-3 bg-blue-50 border-b border-blue-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="h-9 w-9 rounded-lg bg-sky-700 text-white inline-flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2
                id="pdf-review-title"
                className="text-sm sm:text-base font-bold text-slate-900 truncate"
              >
                Xem trước bản xuất PDF (Review)
              </h2>
              <p className="text-xs text-slate-600 font-mono tabular-nums truncate">
                {model.fileName} · Khổ A4 ngang ·{' '}
                {isBuilding
                  ? 'Đang tính số trang...'
                  : builtPdf
                    ? `${builtPdf.pageCount} trang`
                    : 'Sẵn sàng'}{' '}
                · {model.projectCount} công trình
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Zoom Controls */}
            <div className="inline-flex items-center bg-white border border-blue-200 rounded-lg p-0.5">
              <button
                type="button"
                disabled={zoomIndex === 0}
                onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
                aria-label="Thu nhỏ bản xem trước"
                className="h-8 w-8 inline-flex items-center justify-center text-slate-700 hover:bg-blue-50 disabled:opacity-40 rounded-md transition-colors"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 text-xs font-mono font-semibold tabular-nums text-slate-800 min-w-[46px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                disabled={zoomIndex === ZOOM_STEPS.length - 1}
                onClick={() =>
                  setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))
                }
                aria-label="Phóng to bản xem trước"
                className="h-8 w-8 inline-flex items-center justify-center text-slate-700 hover:bg-blue-50 disabled:opacity-40 rounded-md transition-colors"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3.5 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-blue-200 hover:bg-blue-100/60 rounded-lg transition-colors whitespace-nowrap"
            >
              <span>Đóng / Quay lại</span>
            </button>

            <button
              type="button"
              disabled={isBuilding || model.projectCount === 0}
              onClick={handleDownloadPdf}
              className="h-9 px-4 inline-flex items-center gap-2 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              {justDownloaded ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <FileDown className="w-4 h-4" />
              )}
              <span>
                {isBuilding
                  ? 'Đang tạo PDF...'
                  : justDownloaded
                    ? 'Đã tải PDF (Tải lại)'
                    : 'Xác nhận tải PDF'}
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng cửa sổ xem trước"
              className="h-9 w-9 inline-flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-blue-100/70 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {buildError && (
          <div className="px-6 py-2.5 bg-red-50 border-b border-red-200 text-xs text-red-800 font-medium">
            {buildError}
          </div>
        )}

        {/* Paper Sheet Review Canvas */}
        <div className="flex-1 overflow-auto bg-slate-200/85 p-4 sm:p-8">
          <div
            className="mx-auto bg-white border border-slate-300 shadow-lg rounded-xs transition-[width] duration-150"
            style={{ width: `${Math.round(1080 * zoom)}px` }}
          >
            <div className="p-6 sm:p-8 space-y-4 text-slate-900">
              {/* Document Header (Mirrors jsPDF Header) */}
              <div className="space-y-1 border-b border-slate-200 pb-3">
                <h3 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
                  {model.title}
                </h3>
                <p className="text-xs text-slate-600">{model.subtitleLine1}</p>
                <p className="text-xs font-medium text-slate-700 tabular-nums">
                  {model.subtitleLine2}
                </p>
              </div>

              {/* Document Table (Mirrors jsPDF autoTable columns & groupings) */}
              <div className="overflow-x-visible">
                <table className="w-full border-collapse table-fixed text-[11px] leading-snug">
                  <thead>
                    <tr className="bg-sky-700 text-white">
                      {model.columns.map((col, idx) => (
                        <th
                          key={idx}
                          style={{
                            width: `${(col.widthMm / totalWidthMm) * 100}%`,
                          }}
                          className={`py-2 px-2 font-bold border border-sky-800/40 align-middle ${
                            col.align === 'center'
                              ? 'text-center'
                              : col.align === 'right'
                                ? 'text-right'
                                : 'text-left'
                          }`}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {model.rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="py-8 px-4 text-center text-xs text-slate-500 border border-slate-200"
                        >
                          Không có dữ liệu công trình để xuất.
                        </td>
                      </tr>
                    ) : (
                      model.rows.map((row, rIdx) => {
                        if (row.kind === 'capital') {
                          return (
                            <tr key={`cap-${rIdx}`} className="bg-slate-200">
                              <td
                                colSpan={8}
                                className="py-1.5 px-2.5 font-bold text-[11px] text-slate-900 border border-slate-300"
                              >
                                {row.label}
                              </td>
                            </tr>
                          );
                        }
                        if (row.kind === 'area') {
                          return (
                            <tr key={`area-${rIdx}`} className="bg-blue-50">
                              <td
                                colSpan={8}
                                className="py-1.5 pl-4 pr-2.5 font-bold text-[10.5px] text-sky-700 border border-slate-200"
                              >
                                {row.label}
                              </td>
                            </tr>
                          );
                        }

                        return (
                          <tr
                            key={`proj-${rIdx}`}
                            className="align-top hover:bg-slate-50/70"
                          >
                            {row.cells.map((cell, cIdx) => {
                              const colSpec = model.columns[cIdx];
                              const alignClass =
                                colSpec?.align === 'center'
                                  ? 'text-center'
                                  : colSpec?.align === 'right'
                                    ? 'text-right font-mono tabular-nums'
                                    : 'text-left';

                              let extraTone = 'text-slate-900';
                              if (cIdx === 0) {
                                extraTone = 'text-slate-600 font-mono tabular-nums';
                              } else if (cIdx === 1) {
                                extraTone = 'text-sky-800 font-mono font-semibold';
                              } else if (cIdx === 4) {
                                extraTone =
                                  row.statusTone === 'delayed'
                                    ? 'text-red-700 font-semibold'
                                    : row.statusTone === 'attention'
                                      ? 'text-amber-700 font-semibold'
                                      : row.statusTone === 'on_track'
                                        ? 'text-emerald-700 font-semibold'
                                        : 'text-slate-500';
                              } else if (cIdx === 5) {
                                extraTone = 'text-slate-900 font-semibold';
                              }

                              return (
                                <td
                                  key={cIdx}
                                  className={`py-1.5 px-2 border border-slate-200 whitespace-pre-line break-words ${alignClass} ${extraTone}`}
                                >
                                  {cell}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Document Footer */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
                <span>{model.footerLeft}</span>
                <span className="font-mono tabular-nums">
                  {builtPdf
                    ? `Tổng số: ${builtPdf.pageCount} trang A4 ngang`
                    : 'Đang tính số trang...'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
