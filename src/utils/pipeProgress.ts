import { PipeSpec, WaterProject, WeekPeriod, WeeklyReport } from '../types';

export const PIPE_GRADE_PRESETS = [
  'HDPE D315',
  'HDPE D225',
  'HDPE D160',
  'HDPE D110',
  'HDPE D90',
  'HDPE D63',
  'HDPE D40',
  'HDPE D32',
  'PVC D200',
  'PVC D150',
  'PVC D114',
  'PVC D100',
  'PVC D60',
];

export function parseVietnameseNumber(raw: string): number {
  const s = raw.trim();
  if (!s) return 0;
  // Both dot and comma: e.g. 6.425,5 -> 6425.5
  if (s.includes('.') && s.includes(',')) {
    const cleaned = s.replace(/\./g, '').replace(',', '.');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  // Only comma: decimal separator e.g. 46,5 -> 46.5
  if (s.includes(',')) {
    const cleaned = s.replace(',', '.');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  // Only dots matching thousand grouping: e.g. 5.174 or 1.943 -> 5174
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    const cleaned = s.replace(/\./g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function formatMeters(val: number): string {
  const rounded = Math.round(val * 10) / 10;
  return rounded.toLocaleString('vi-VN', {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

export function projectHasWaterPipes(
  project: Pick<WaterProject, 'category' | 'name' | 'totalPlannedVolume' | 'approvedPipes'>
): boolean {
  if (project.category === 'Tuyến ống cấp nước') return true;
  if ((project.approvedPipes?.length ?? 0) > 0) return true;
  const hay = `${project.name} ${project.totalPlannedVolume}`;
  return /tuyến ống|\bống\s+(?:cấp nước|HDPE|PVC|gang|thép|D\d{2,3})|\b(?:HDPE|PVC)\s*D?\d{2,3}\b/i.test(
    hay
  );
}

function extractPipeLabelsFromName(projectName: string): string[] {
  if (!projectName) return [];
  // Prefer the new pipe specification after "bằng ống" / "bằng" in replacement projects
  const replacementSplit = projectName.split(
    /\bbằng\s+(?:các\s+)?(?:tuyến\s+)?ống\b|\bbằng\b/i
  );
  let target =
    replacementSplit.length > 1
      ? replacementSplit[replacementSplit.length - 1]
      : projectName;

  // Strip non-pipe equipment diameters (đồng hồ, van, trụ chữa cháy)
  target = target
    .replace(/đồng hồ(?:\s+điện từ)?\s*D?N?\s*\d{2,3}/gi, '')
    .replace(/van(?:\s+(?:bước|điện|tuần hoàn|xả khí))?\s*D?N?\s*\d{2,3}/gi, '')
    .replace(/trụ chữa cháy\s*D?N?\s*\d{2,3}/gi, '');

  const labels: string[] = [];
  const seen = new Set<string>();
  let currentMaterial = '';

  const tokenRegex = /(?:(HDPE|PVC|Gang|Thép)\s*)?D(\d{2,3})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(target)) !== null) {
    if (match[1]) {
      const matRaw = match[1].toUpperCase();
      currentMaterial =
        matRaw === 'GANG' ? 'Gang' : matRaw === 'THÉP' ? 'Thép' : matRaw;
    }
    const diam = `D${match[2]}`;
    const label = currentMaterial ? `${currentMaterial} ${diam}` : diam;
    const key = label.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      labels.push(label);
    }
  }

  return labels;
}

/**
 * Extracts pipe grades & approved lengths from cumulativeText strings and projectName:
 * - "HM1: D63 391/391m, D225 1004/1004m · HM2: D110 1318/1318m, D160 46,5/46,5m"
 * - "Ống HDPE D63: 5.174/6.157m · Ống HDPE D160: 5.450/6.425,5m"
 * - "D63=136m · D110=689m"
 * - "400m HDPE D63" or "HDPE D63: 375m · HDPE D32: 20m"
 * - Fallback to pipe diameters in projectName (e.g. "HDPE D315 và D63")
 */
export function parseApprovedPipesFromText(
  projectId: string,
  cumulativeText: string,
  projectName?: string
): PipeSpec[] {
  const specs: PipeSpec[] = [];
  const majorParts = (cumulativeText || '').split(/[·;]/);
  let seq = 1;
  let activePrefix = '';

  for (const rawPart of majorParts) {
    const part = rawPart.trim();
    if (!part) continue;

    // Detect HM1:, HM2:, HM3:
    const hmMatch = part.match(/^(HM\d+)\s*:/i);
    if (hmMatch) {
      activePrefix = hmMatch[1].toUpperCase();
    }

    // Sub-split by comma only when followed by another pipe label (avoid splitting 46,5)
    const subParts = part.split(/,\s*(?=(?:[A-Za-zÀ-ỹ]+|\bD\d+|HDPE|PVC|Ống))/i);
    for (const rawSub of subParts) {
      const sub = rawSub.trim();
      if (!sub) continue;

      // Skip non-pipe civil items like "Nền gạch: 1709/1709m"
      const lowerSub = sub.toLowerCase();
      if (
        lowerSub.includes('nền gạch') ||
        lowerSub.includes('cắt đường') ||
        lowerSub.includes('bê tông')
      ) {
        continue;
      }

      // Pattern 1: <label>: <achieved>/<approved>m  OR  <label> <achieved>/<approved>m
      const ratioMatch = sub.match(
        /(?:HM\d+\s*:\s*)?((?:Ống\s+|Lồng\s+)?(?:HDPE|PVC|Gang|Thép)?\s*D?\d{2,3}(?:\s*D?\d{2,3})?)\s*[:=]?\s*([\d.,]+)\s*\/\s*([\d.,]+)\s*m?\b/i
      );
      if (ratioMatch) {
        let label = ratioMatch[1].replace(/^Ống\s+/i, '').trim();
        label = label.replace(/^(HDPE|PVC)\s+(\d{2,3})$/i, '$1 D$2');
        if (/^\d{2,3}$/.test(label)) {
          label = `D${label}`;
        }
        if (activePrefix && !label.toUpperCase().startsWith(activePrefix)) {
          label = `${activePrefix} - ${label}`;
        }

        const achievedM = parseVietnameseNumber(ratioMatch[2]);
        const approvedM = parseVietnameseNumber(ratioMatch[3]);
        if (approvedM > 0) {
          specs.push({
            id: `${projectId}-pipe-${seq++}`,
            label,
            approvedLengthM: approvedM,
            baselineCompletedM: achievedM,
          });
          continue;
        }
      }

      // Pattern 2: D63=136m · D110=689m
      const eqMatch = sub.match(
        /((?:HDPE|PVC)?\s*D\d{2,3})\s*=\s*([\d.,]+)\s*m\b/i
      );
      if (eqMatch) {
        const label = eqMatch[1].trim();
        const approvedM = parseVietnameseNumber(eqMatch[2]);
        if (approvedM > 0) {
          specs.push({
            id: `${projectId}-pipe-${seq++}`,
            label,
            approvedLengthM: approvedM,
            baselineCompletedM: 0,
          });
          continue;
        }
      }

      // Pattern 3: Single completed length without approved denominator, e.g. "HDPE D63: 375m" or "400m HDPE D63"
      const singleAfterMatch = sub.match(
        /^((?:Ống\s+)?(?:HDPE|PVC|Gang|Thép)?\s*D\d{2,3}(?:\/\d{2,3})?)\s*:\s*([\d.,]+)\s*m\b/i
      );
      if (singleAfterMatch) {
        const label = singleAfterMatch[1].replace(/^Ống\s+/i, '').trim();
        const completedM = parseVietnameseNumber(singleAfterMatch[2]);
        specs.push({
          id: `${projectId}-pipe-${seq++}`,
          label,
          approvedLengthM: 0,
          baselineCompletedM: completedM,
        });
        continue;
      }

      const singleBeforeMatch = sub.match(
        /^([\d.,]+)\s*m\s+((?:Ống\s+)?(?:HDPE|PVC|Gang|Thép)?\s*D\d{2,3})/i
      );
      if (singleBeforeMatch) {
        const completedM = parseVietnameseNumber(singleBeforeMatch[1]);
        const label = singleBeforeMatch[2].replace(/^Ống\s+/i, '').trim();
        specs.push({
          id: `${projectId}-pipe-${seq++}`,
          label,
          approvedLengthM: 0,
          baselineCompletedM: completedM,
        });
      }
    }
  }

  if (specs.length === 0 && projectName) {
    const nameLabels = extractPipeLabelsFromName(projectName);
    for (const label of nameLabels) {
      specs.push({
        id: `${projectId}-pipe-${seq++}`,
        label,
        approvedLengthM: 0,
        baselineCompletedM: 0,
      });
    }
  }

  if (specs.length === 0 && projectName) {
    specs.push({
      id: `${projectId}-pipe-1`,
      label: 'Ống cấp nước',
      approvedLengthM: 0,
      baselineCompletedM: 0,
    });
  }

  return specs;
}

export interface PipeRowProgress {
  spec: PipeSpec;
  priorM: number;
  weekM: number;
  cumulativeM: number;
  pct: number;
}

export interface ProjectPipeSummary {
  hasPipes: boolean;
  hasApprovedLengths: boolean;
  rows: PipeRowProgress[];
  totalApprovedM: number;
  totalPriorM: number;
  totalWeekM: number;
  totalCumulativeM: number;
  priorPct: number;
  cumulativePct: number;
  weeklyDeltaPct: number;
  suggestedVolumeText: string;
}

export function computeProjectPipeSummary(params: {
  project: WaterProject;
  weekId: string;
  weeks: WeekPeriod[];
  reports: WeeklyReport[];
  draftPipeLengths?: Record<string, number>;
}): ProjectPipeSummary {
  const { project, weekId, weeks, reports, draftPipeLengths } = params;
  const specs = project.approvedPipes ?? [];

  if (specs.length === 0) {
    return {
      hasPipes: false,
      hasApprovedLengths: false,
      rows: [],
      totalApprovedM: 0,
      totalPriorM: 0,
      totalWeekM: 0,
      totalCumulativeM: 0,
      priorPct: 0,
      cumulativePct: 0,
      weeklyDeltaPct: 0,
      suggestedVolumeText: '',
    };
  }

  const weekOrder = new Map<string, number>();
  weeks.forEach((w, idx) => weekOrder.set(w.id, idx));
  const currentWeekIdx = weekOrder.get(weekId) ?? weeks.length - 1;

  const projectReports = reports.filter((r) => r.projectId === project.id);
  const currentReport = projectReports.find((r) => r.weekId === weekId);

  let totalApprovedM = 0;
  let totalPriorM = 0;
  let totalWeekM = 0;
  let totalCumulativeM = 0;
  const volumeParts: string[] = [];

  const rows: PipeRowProgress[] = specs.map((spec) => {
    let priorM = spec.baselineCompletedM ?? 0;

    for (const rep of projectReports) {
      const repIdx = weekOrder.get(rep.weekId);
      if (repIdx !== undefined && repIdx < currentWeekIdx) {
        const val = rep.pipeLengths?.[spec.id];
        if (typeof val === 'number' && Number.isFinite(val)) {
          priorM += val;
        }
      }
    }

    const weekM =
      draftPipeLengths !== undefined
        ? Number(draftPipeLengths[spec.id] ?? 0) || 0
        : Number(currentReport?.pipeLengths?.[spec.id] ?? 0) || 0;

    const cumulativeM = priorM + weekM;
    const pct =
      spec.approvedLengthM > 0
        ? Math.min(
            100,
            Math.round((cumulativeM / spec.approvedLengthM) * 1000) / 10
          )
        : 0;

    totalApprovedM += spec.approvedLengthM;
    totalPriorM += priorM;
    totalWeekM += weekM;
    totalCumulativeM += cumulativeM;

    if (weekM > 0 || cumulativeM > 0) {
      volumeParts.push(
        spec.approvedLengthM > 0
          ? `${spec.label}: ${
              weekM > 0 ? `+${formatMeters(weekM)}m (` : ''
            }lũy kế ${formatMeters(cumulativeM)}/${formatMeters(
              spec.approvedLengthM
            )}m${weekM > 0 ? ')' : ''}`
          : `${spec.label}: ${
              weekM > 0 ? `+${formatMeters(weekM)}m (` : ''
            }lũy kế ${formatMeters(cumulativeM)}m${weekM > 0 ? ')' : ''}`
      );
    }

    return {
      spec,
      priorM,
      weekM,
      cumulativeM,
      pct,
    };
  });

  const priorPct =
    totalApprovedM > 0
      ? Math.min(
          100,
          Math.round((totalPriorM / totalApprovedM) * 1000) / 10
        )
      : 0;
  const cumulativePct =
    totalApprovedM > 0
      ? Math.min(
          100,
          Math.round((totalCumulativeM / totalApprovedM) * 1000) / 10
        )
      : 0;
  const weeklyDeltaPct = Math.max(
    0,
    Math.round((cumulativePct - priorPct) * 10) / 10
  );

  return {
    hasPipes: true,
    hasApprovedLengths: totalApprovedM > 0,
    rows,
    totalApprovedM,
    totalPriorM,
    totalWeekM,
    totalCumulativeM,
    priorPct,
    cumulativePct,
    weeklyDeltaPct,
    suggestedVolumeText: volumeParts.join(' · '),
  };
}

export interface SupervisorEvaluation {
  totalProjects: number;
  pipeProjectsCount: number;
  totalApprovedM: number;
  totalCumulativeM: number;
  pipeCompletionPct: number | null;
  overallCompletionPct: number;
  ratingLabel: string;
  ratingTone: 'emerald' | 'sky' | 'amber' | 'red';
}

export function evaluateSupervisorProgress(params: {
  supervisorProjects: WaterProject[];
  weekId: string;
  weeks: WeekPeriod[];
  reports: WeeklyReport[];
}): SupervisorEvaluation {
  const { supervisorProjects, weekId, weeks, reports } = params;

  if (supervisorProjects.length === 0) {
    return {
      totalProjects: 0,
      pipeProjectsCount: 0,
      totalApprovedM: 0,
      totalCumulativeM: 0,
      pipeCompletionPct: null,
      overallCompletionPct: 0,
      ratingLabel: 'Chưa có công trình',
      ratingTone: 'sky',
    };
  }

  const weekOrder = new Map<string, number>();
  weeks.forEach((w, idx) => weekOrder.set(w.id, idx));
  const selectedIdx = weekOrder.get(weekId) ?? weeks.length - 1;

  let pipeProjectsCount = 0;
  let totalApprovedM = 0;
  let totalCumulativeM = 0;
  let pctSum = 0;

  for (const project of supervisorProjects) {
    const pipeSummary = computeProjectPipeSummary({
      project,
      weekId,
      weeks,
      reports,
    });

    if (pipeSummary.hasPipes && pipeSummary.totalApprovedM > 0) {
      pipeProjectsCount += 1;
      totalApprovedM += pipeSummary.totalApprovedM;
      totalCumulativeM += pipeSummary.totalCumulativeM;
      pctSum += pipeSummary.cumulativePct;
    } else {
      // Find report at selected week or latest prior week
      const rep = reports.find(
        (r) => r.projectId === project.id && r.weekId === weekId
      );
      if (rep) {
        pctSum += rep.cumulativeProgress;
      } else {
        let fallbackPct = 0;
        for (let i = selectedIdx - 1; i >= 0; i--) {
          const prevRep = reports.find(
            (r) => r.projectId === project.id && r.weekId === weeks[i].id
          );
          if (prevRep) {
            fallbackPct = prevRep.cumulativeProgress;
            break;
          }
        }
        pctSum += fallbackPct;
      }
    }
  }

  const pipeCompletionPct =
    totalApprovedM > 0
      ? Math.min(
          100,
          Math.round((totalCumulativeM / totalApprovedM) * 1000) / 10
        )
      : null;

  const overallCompletionPct =
    Math.round((pctSum / supervisorProjects.length) * 10) / 10;

  const evalBasis = pipeCompletionPct ?? overallCompletionPct;

  let ratingLabel = 'Cần đẩy nhanh';
  let ratingTone: SupervisorEvaluation['ratingTone'] = 'red';
  if (evalBasis >= 85) {
    ratingLabel = 'Hoàn thành tốt';
    ratingTone = 'emerald';
  } else if (evalBasis >= 60) {
    ratingLabel = 'Đạt tiến độ';
    ratingTone = 'sky';
  } else if (evalBasis >= 30) {
    ratingLabel = 'Đang triển khai';
    ratingTone = 'amber';
  }

  return {
    totalProjects: supervisorProjects.length,
    pipeProjectsCount,
    totalApprovedM,
    totalCumulativeM,
    pipeCompletionPct,
    overallCompletionPct,
    ratingLabel,
    ratingTone,
  };
}
