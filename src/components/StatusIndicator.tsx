import { AlertTriangle, CheckCircle2, Clock, MinusCircle } from 'lucide-react';
import { ReportStatus } from '../types';

interface StatusIndicatorProps {
  status: ReportStatus | 'missing';
}

const STATUS_CONFIG: Record<
  ReportStatus | 'missing',
  { label: string; textClass: string; Icon: typeof CheckCircle2 }
> = {
  on_track: {
    label: 'Đúng tiến độ',
    textClass: 'text-emerald-700',
    Icon: CheckCircle2,
  },
  attention: {
    label: 'Cần lưu ý',
    textClass: 'text-amber-700',
    Icon: AlertTriangle,
  },
  delayed: {
    label: 'Chậm tiến độ',
    textClass: 'text-red-700',
    Icon: Clock,
  },
  missing: {
    label: 'Chưa báo cáo',
    textClass: 'text-slate-500',
    Icon: MinusCircle,
  },
};

export function StatusIndicator({ status }: StatusIndicatorProps) {
  const config = STATUS_CONFIG[status];
  const { Icon } = config;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${config.textClass}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  );
}
