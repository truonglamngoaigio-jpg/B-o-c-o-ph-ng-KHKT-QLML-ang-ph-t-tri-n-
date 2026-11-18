import { useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { PipeSpec, ProjectCategory, Supervisor } from '../types';
import { PIPE_GRADE_PRESETS, formatMeters } from '../utils/pipeProgress';
import {
  AREA_GROUP_OPTIONS,
  CAPITAL_GROUP_OPTIONS,
} from '../utils/projectGrouping';

interface AddProjectModalProps {
  isOpen: boolean;
  supervisors: Supervisor[];
  capitalOptions: string[];
  areaOptions: string[];
  defaultCapitalGroup?: string;
  defaultAreaGroup?: string;
  nextCodeSuggestion: string;
  onClose: () => void;
  onCreateProject: (input: {
    code: string;
    name: string;
    capitalGroup: string;
    areaGroup: string;
    location: string;
    category: ProjectCategory;
    supervisorId: string | null;
    budgetBillionVND: number;
    targetEndDate: string;
    totalPlannedVolume: string;
    approvedPipes?: PipeSpec[];
  }) => void;
}

export function AddProjectModal({
  isOpen,
  supervisors,
  capitalOptions,
  areaOptions,
  defaultCapitalGroup,
  defaultAreaGroup,
  nextCodeSuggestion,
  onClose,
  onCreateProject,
}: AddProjectModalProps) {
  const effectiveCapitalOptions =
    capitalOptions.length > 0 ? capitalOptions : [...CAPITAL_GROUP_OPTIONS];
  const effectiveAreaOptions =
    areaOptions.length > 0 ? areaOptions : [...AREA_GROUP_OPTIONS];

  const [code, setCode] = useState(nextCodeSuggestion);
  const [name, setName] = useState('');
  const [capitalGroup, setCapitalGroup] = useState<string>(
    defaultCapitalGroup && defaultCapitalGroup !== 'all'
      ? defaultCapitalGroup
      : effectiveCapitalOptions[0]
  );
  const [areaGroup, setAreaGroup] = useState<string>(
    defaultAreaGroup && defaultAreaGroup !== 'all'
      ? defaultAreaGroup
      : effectiveAreaOptions[0]
  );
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState<ProjectCategory>('Tuyến ống cấp nước');
  const [supervisorId, setSupervisorId] = useState<string>('');
  const [budget, setBudget] = useState('15.0');
  const [targetEndDate, setTargetEndDate] = useState('ĐANG THI CÔNG');
  const [totalPlannedVolume, setTotalPlannedVolume] = useState('');
  const [pipeDraftRows, setPipeDraftRows] = useState<
    { label: string; approvedLengthM: string }[]
  >([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setCode(nextCodeSuggestion);
      setCapitalGroup(
        defaultCapitalGroup && defaultCapitalGroup !== 'all'
          ? defaultCapitalGroup
          : effectiveCapitalOptions[2] ?? effectiveCapitalOptions[0]
      );
      setAreaGroup(
        defaultAreaGroup && defaultAreaGroup !== 'all'
          ? defaultAreaGroup
          : effectiveAreaOptions[0]
      );
      setPipeDraftRows([]);
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, nextCodeSuggestion, defaultCapitalGroup, defaultAreaGroup]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim() || !location.trim()) {
      setError('Vui lòng nhập đầy đủ mã, tên công trình và địa điểm.');
      return;
    }

    const stamp = Date.now();
    const cleanedPipes: PipeSpec[] =
      category === 'Tuyến ống cấp nước'
        ? pipeDraftRows
            .map((row, idx) => ({
              id: `proj-${stamp}-pipe-${idx + 1}`,
              label: row.label.trim(),
              approvedLengthM: Math.max(0, Number(row.approvedLengthM) || 0),
              baselineCompletedM: 0,
            }))
            .filter((p) => p.label && p.approvedLengthM > 0)
        : [];

    const autoVolumeText =
      cleanedPipes.length > 0
        ? cleanedPipes
            .map((p) => `${p.label}: ${formatMeters(p.approvedLengthM)}m`)
            .join(' · ')
        : '';

    onCreateProject({
      code: code.trim(),
      name: name.trim(),
      capitalGroup,
      areaGroup,
      location: location.trim(),
      category,
      supervisorId: supervisorId || null,
      budgetBillionVND: Number(budget) || 0,
      targetEndDate: targetEndDate.trim() || 'Đang cập nhật',
      totalPlannedVolume:
        totalPlannedVolume.trim() ||
        autoVolumeText ||
        'Theo hồ sơ thiết kế được duyệt',
      ...(category === 'Tuyến ống cấp nước'
        ? { approvedPipes: cleanedPipes }
        : {}),
    });

    setName('');
    setLocation('');
    setTotalPlannedVolume('');
    setPipeDraftRows([]);
    setSupervisorId('');
    setError('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="Thêm công trình cấp nước mới"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">
            Thêm công trình cấp nước mới
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Mã công trình
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full h-9 px-3 text-xs font-mono text-slate-900 border border-slate-300 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Loại công trình
              </label>
              <select
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as ProjectCategory)
                }
                className="w-full h-9 px-3 text-xs font-medium text-slate-900 border border-slate-300 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
              >
                <option value="Tuyến ống cấp nước">Tuyến ống cấp nước</option>
                <option value="Trạm bơm tăng áp">Trạm bơm tăng áp</option>
                <option value="Nhà máy xử lý nước">Nhà máy xử lý nước</option>
                <option value="Bể chứa & Điều hòa">Bể chứa & Điều hòa</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Tên công trình
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ví dụ: Tuyến ống cấp nước D300 đường Nguyễn Hữu Thọ"
              className="w-full h-9 px-3 text-sm text-slate-900 border border-slate-300 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nhóm công trình / Nguồn vốn
              </label>
              <select
                value={capitalGroup}
                onChange={(e) => setCapitalGroup(e.target.value)}
                className="w-full h-9 px-3 text-xs font-medium text-slate-900 border border-slate-300 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
              >
                {effectiveCapitalOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Khu vực
              </label>
              <select
                value={areaGroup}
                onChange={(e) => setAreaGroup(e.target.value)}
                className="w-full h-9 px-3 text-xs font-medium text-slate-900 border border-slate-300 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
              >
                {effectiveAreaOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Địa điểm chi tiết
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ví dụ: P. Phú Thủy, Phan Thiết"
                className="w-full h-9 px-3 text-sm text-slate-900 border border-slate-300 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Phân công giám sát ngay
              </label>
              <select
                value={supervisorId}
                onChange={(e) => setSupervisorId(e.target.value)}
                className="w-full h-9 px-3 text-xs font-medium text-slate-900 border border-slate-300 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
              >
                <option value="">-- Chưa phân công --</option>
                {supervisors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Tổng mức đầu tư (tỷ đồng)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="w-full h-9 px-3 text-xs font-mono tabular-nums text-slate-900 border border-slate-300 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Trạng thái / Tiến độ chung
              </label>
              <input
                type="text"
                value={targetEndDate}
                onChange={(e) => setTargetEndDate(e.target.value)}
                className="w-full h-9 px-3 text-xs font-mono text-slate-900 border border-slate-300 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Quy mô / Lũy kế thiết kế
            </label>
            <input
              type="text"
              value={totalPlannedVolume}
              onChange={(e) => setTotalPlannedVolume(e.target.value)}
              placeholder="Ví dụ: 5.200 m ống HDPE D250 & 6 hố van"
              className="w-full h-9 px-3 text-sm text-slate-900 border border-slate-300 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
            />
          </div>

          {category === 'Tuyến ống cấp nước' && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800">
                  Phê duyệt cấp đường ống &amp; chiều dài (tùy chọn)
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPipeDraftRows((rows) => [
                      ...rows,
                      { label: 'HDPE D110', approvedLengthM: '' },
                    ])
                  }
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 hover:text-sky-900 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm cấp ống</span>
                </button>
              </div>
              <datalist id="pipe-grade-presets-modal">
                {PIPE_GRADE_PRESETS.map((preset) => (
                  <option key={preset} value={preset} />
                ))}
              </datalist>
              {pipeDraftRows.length > 0 && (
                <div className="space-y-2">
                  {pipeDraftRows.map((row, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        list="pipe-grade-presets-modal"
                        value={row.label}
                        onChange={(e) =>
                          setPipeDraftRows((rows) =>
                            rows.map((r, i) =>
                              i === idx ? { ...r, label: e.target.value } : r
                            )
                          )
                        }
                        placeholder="Cấp ống (VD: HDPE D225)"
                        className="flex-1 h-8 px-2.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-md"
                      />
                      <input
                        type="number"
                        min={0}
                        step="0.1"
                        value={row.approvedLengthM}
                        onChange={(e) =>
                          setPipeDraftRows((rows) =>
                            rows.map((r, i) =>
                              i === idx
                                ? { ...r, approvedLengthM: e.target.value }
                                : r
                            )
                          )
                        }
                        placeholder="Dài (m)"
                        className="w-28 h-8 px-2.5 text-right text-xs font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md"
                      />
                      <button
                        type="button"
                        aria-label="Xóa cấp ống"
                        onClick={() =>
                          setPipeDraftRows((rows) =>
                            rows.filter((_, i) => i !== idx)
                          )
                        }
                        className="h-8 w-8 inline-flex items-center justify-center text-slate-400 hover:text-red-700 rounded-md"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-xs font-medium text-red-700">{error}</p>}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="h-9 px-4 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg"
            >
              Lưu công trình
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface AddProjectGroupModalProps {
  isOpen: boolean;
  existingCapitalOptions: string[];
  onClose: () => void;
  onCreateProjectGroup: (input: {
    capitalGroup: string;
    areas: string[];
  }) => void;
}

export function AddProjectGroupModal({
  isOpen,
  existingCapitalOptions,
  onClose,
  onCreateProjectGroup,
}: AddProjectGroupModalProps) {
  const [mode, setMode] = useState<'new_capital' | 'add_area'>('new_capital');
  const [newCapitalName, setNewCapitalName] = useState('');
  const [selectedExistingCapital, setSelectedExistingCapital] = useState(
    existingCapitalOptions[0] ?? ''
  );
  const [areaInput, setAreaInput] = useState('I. Khu vực Phan Thiết');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setError('');
      setSelectedExistingCapital(existingCapitalOptions[0] ?? '');
      if (mode === 'new_capital') {
        setAreaInput('I. Khu vực Phan Thiết');
      } else {
        setAreaInput('');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handleModeChange = (nextMode: 'new_capital' | 'add_area') => {
    setMode(nextMode);
    setError('');
    setAreaInput(nextMode === 'new_capital' ? 'I. Khu vực Phan Thiết' : '');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const targetCapital =
      mode === 'new_capital' ? newCapitalName.trim() : selectedExistingCapital.trim();

    if (!targetCapital) {
      setError('Vui lòng nhập tên nhóm công trình / nguồn vốn.');
      return;
    }

    const parsedAreas = areaInput
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (mode === 'add_area' && parsedAreas.length === 0) {
      setError('Vui lòng nhập tên khu vực mới cần thêm vào nhóm.');
      return;
    }

    onCreateProjectGroup({
      capitalGroup: targetCapital,
      areas: parsedAreas.length > 0 ? parsedAreas : ['Khu vực chung'],
    });

    setNewCapitalName('');
    setAreaInput('I. Khu vực Phan Thiết');
    setError('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="Thêm nhóm công trình hoặc khu vực mới"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">
            Thêm nhóm công trình
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg">
            <button
              type="button"
              onClick={() => handleModeChange('new_capital')}
              className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors ${
                mode === 'new_capital'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tạo nhóm vốn mới
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('add_area')}
              className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors ${
                mode === 'add_area'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Thêm khu vực vào nhóm
            </button>
          </div>

          {mode === 'new_capital' ? (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Tên nhóm công trình / Nguồn vốn mới
              </label>
              <input
                type="text"
                value={newCapitalName}
                onChange={(e) => setNewCapitalName(e.target.value)}
                placeholder="Ví dụ: G. Công trình XDCB năm 2027"
                className="w-full h-9 px-3 text-sm text-slate-900 border border-slate-300 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Chọn nhóm công trình hiện có
              </label>
              <select
                value={selectedExistingCapital}
                onChange={(e) => setSelectedExistingCapital(e.target.value)}
                className="w-full h-9 px-3 text-xs font-medium text-slate-900 border border-slate-300 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
              >
                {existingCapitalOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {mode === 'new_capital'
                ? 'Khu vực trong nhóm (ngăn cách bằng dấu phẩy nếu nhiều khu vực)'
                : 'Tên khu vực mới'}
            </label>
            <input
              type="text"
              value={areaInput}
              onChange={(e) => setAreaInput(e.target.value)}
              placeholder={
                mode === 'new_capital'
                  ? 'Ví dụ: I. Khu vực Phan Thiết, II. Khu vực La Gi'
                  : 'Ví dụ: IV. Khu vực Hàm Thuận Nam'
              }
              className="w-full h-9 px-3 text-sm text-slate-900 border border-slate-300 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
            />
          </div>

          {error && <p className="text-xs font-medium text-red-700">{error}</p>}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="h-9 px-4 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg"
            >
              Tạo nhóm
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface AddSupervisorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateSupervisor: (input: {
    name: string;
    role: string;
    specialty: string;
    phone: string;
  }) => void;
}

export function AddSupervisorModal({
  isOpen,
  onClose,
  onCreateSupervisor,
}: AddSupervisorModalProps) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('Giám sát công trình');
  const [specialty, setSpecialty] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Vui lòng nhập họ tên cán bộ giám sát.');
      return;
    }
    onCreateSupervisor({ name, role, specialty, phone });
    setName('');
    setSpecialty('');
    setPhone('');
    setError('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="Thêm giám sát mới"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">
            Thêm giám sát & Tạo tab riêng
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Họ và tên giám sát
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ví dụ: KS. Đặng Văn Hùng"
              className="w-full h-9 px-3 text-sm text-slate-900 border border-slate-300 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Chức danh
            </label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full h-9 px-3 text-sm text-slate-900 border border-slate-300 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Chuyên trách công trình
            </label>
            <input
              type="text"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              placeholder="Ví dụ: Tuyến ống cấp nước & đấu nối hộ dân"
              className="w-full h-9 px-3 text-sm text-slate-900 border border-slate-300 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Số điện thoại liên hệ
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="09xx xxx xxx"
              className="w-full h-9 px-3 text-sm font-mono text-slate-900 border border-slate-300 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
            />
          </div>

          {error && <p className="text-xs font-medium text-red-700">{error}</p>}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="h-9 px-4 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg"
            >
              Tạo tab giám sát
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
