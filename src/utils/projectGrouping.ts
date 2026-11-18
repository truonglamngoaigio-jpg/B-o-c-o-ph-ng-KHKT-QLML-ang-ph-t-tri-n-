import { ProjectGroupDefinition, WaterProject } from '../types';

export const CAPITAL_GROUP_OPTIONS = [
  'A. Chuyển tiếp năm 2025 sang',
  'B. Các công trình kỳ vọng',
  'C. XDCB năm 2026',
  'E. Công trình phát sinh (Vốn nội bộ)',
  'F. Công trình phát sinh (Vốn ngoài)',
  'M. Dự án khu vực Bình Thuận',
] as const;

export const AREA_GROUP_OPTIONS = [
  'I. Khu vực Phan Thiết',
  'II. Khu vực La Gi',
  'III. Khu vực Bắc Bình',
  'Khu vực Bình Thuận',
] as const;

export function inferProjectGrouping(
  id: string,
  location?: string
): { capitalGroup: string; areaGroup: string } {
  if (id.startsWith('A-')) {
    return {
      capitalGroup: 'A. Chuyển tiếp năm 2025 sang',
      areaGroup: 'I. Khu vực Phan Thiết',
    };
  }
  if (id.startsWith('B-')) {
    return {
      capitalGroup: 'B. Các công trình kỳ vọng',
      areaGroup: 'I. Khu vực Phan Thiết',
    };
  }
  if (id.startsWith('C-I-')) {
    return {
      capitalGroup: 'C. XDCB năm 2026',
      areaGroup: 'I. Khu vực Phan Thiết',
    };
  }
  if (id.startsWith('C-II-')) {
    return {
      capitalGroup: 'C. XDCB năm 2026',
      areaGroup: 'II. Khu vực La Gi',
    };
  }
  if (id.startsWith('C-III-')) {
    return {
      capitalGroup: 'C. XDCB năm 2026',
      areaGroup: 'III. Khu vực Bắc Bình',
    };
  }
  if (id.startsWith('E-')) {
    return {
      capitalGroup: 'E. Công trình phát sinh (Vốn nội bộ)',
      areaGroup: 'I. Khu vực Phan Thiết',
    };
  }
  if (id.startsWith('EI-')) {
    return {
      capitalGroup: 'F. Công trình phát sinh (Vốn ngoài)',
      areaGroup: 'I. Khu vực Phan Thiết',
    };
  }
  if (id.startsWith('M-')) {
    return {
      capitalGroup: 'M. Dự án khu vực Bình Thuận',
      areaGroup: 'Khu vực Bình Thuận',
    };
  }

  const loc = (location ?? '').toLowerCase();
  let areaGroup = 'I. Khu vực Phan Thiết';
  if (loc.includes('la gi') || loc.includes('lagi') || loc.includes('phước hội')) {
    areaGroup = 'II. Khu vực La Gi';
  } else if (loc.includes('bắc bình') || loc.includes('phan rí') || loc.includes('hồng thái') || loc.includes('hồng chính')) {
    areaGroup = 'III. Khu vực Bắc Bình';
  } else if (loc.includes('bình thuận') && !loc.includes('phan thiết') && !loc.includes('p. bình thuận')) {
    areaGroup = 'Khu vực Bình Thuận';
  }

  return {
    capitalGroup: 'E. Công trình phát sinh (Vốn nội bộ)',
    areaGroup,
  };
}

export interface AreaSection {
  areaGroup: string;
  projects: WaterProject[];
}

export interface CapitalSection {
  capitalGroup: string;
  totalCount: number;
  areas: AreaSection[];
}

function getOrderIndex(value: string, canonicalOrder: readonly string[]): number {
  const idx = canonicalOrder.indexOf(value);
  return idx >= 0 ? idx : canonicalOrder.length + 1;
}

export function groupProjectsByCapitalAndArea(
  projects: WaterProject[],
  extraGroups: ProjectGroupDefinition[] = []
): CapitalSection[] {
  const capitalMap = new Map<string, Map<string, WaterProject[]>>();

  for (const grp of extraGroups) {
    const cap = grp.capitalGroup.trim();
    if (!cap) continue;
    let areaMap = capitalMap.get(cap);
    if (!areaMap) {
      areaMap = new Map<string, WaterProject[]>();
      capitalMap.set(cap, areaMap);
    }
    const areaList = grp.areas.length > 0 ? grp.areas : ['Khu vực chung'];
    for (const rawArea of areaList) {
      const area = rawArea.trim();
      if (area && !areaMap.has(area)) {
        areaMap.set(area, []);
      }
    }
  }

  for (const project of projects) {
    const cap = project.capitalGroup?.trim() || 'Chưa phân loại nguồn vốn';
    const area = project.areaGroup?.trim() || 'Khu vực khác';

    let areaMap = capitalMap.get(cap);
    if (!areaMap) {
      areaMap = new Map<string, WaterProject[]>();
      capitalMap.set(cap, areaMap);
    }

    let list = areaMap.get(area);
    if (!list) {
      list = [];
      areaMap.set(area, list);
    }
    list.push(project);
  }

  const capitalKeys = Array.from(capitalMap.keys()).sort((a, b) => {
    const idxA = getOrderIndex(a, CAPITAL_GROUP_OPTIONS);
    const idxB = getOrderIndex(b, CAPITAL_GROUP_OPTIONS);
    if (idxA !== idxB) return idxA - idxB;
    return a.localeCompare(b, 'vi');
  });

  return capitalKeys.map((capitalGroup) => {
    const areaMap = capitalMap.get(capitalGroup)!;
    const areaKeys = Array.from(areaMap.keys()).sort((a, b) => {
      const idxA = getOrderIndex(a, AREA_GROUP_OPTIONS);
      const idxB = getOrderIndex(b, AREA_GROUP_OPTIONS);
      if (idxA !== idxB) return idxA - idxB;
      return a.localeCompare(b, 'vi');
    });

    const areas: AreaSection[] = areaKeys.map((areaGroup) => ({
      areaGroup,
      projects: areaMap.get(areaGroup)!,
    }));

    const totalCount = areas.reduce((sum, a) => sum + a.projects.length, 0);

    return {
      capitalGroup,
      totalCount,
      areas,
    };
  });
}

export function getCapitalAndAreaOptions(
  projects: WaterProject[],
  extraGroups: ProjectGroupDefinition[] = []
): { capitalOptions: string[]; allAreaOptions: string[] } {
  const capSet = new Set<string>(CAPITAL_GROUP_OPTIONS);
  const areaSet = new Set<string>(AREA_GROUP_OPTIONS);

  for (const grp of extraGroups) {
    if (grp.capitalGroup.trim()) capSet.add(grp.capitalGroup.trim());
    for (const a of grp.areas) {
      if (a.trim()) areaSet.add(a.trim());
    }
  }
  for (const p of projects) {
    if (p.capitalGroup?.trim()) capSet.add(p.capitalGroup.trim());
    if (p.areaGroup?.trim()) areaSet.add(p.areaGroup.trim());
  }

  const capitalOptions = Array.from(capSet).sort((a, b) => {
    const idxA = getOrderIndex(a, CAPITAL_GROUP_OPTIONS);
    const idxB = getOrderIndex(b, CAPITAL_GROUP_OPTIONS);
    if (idxA !== idxB) return idxA - idxB;
    return a.localeCompare(b, 'vi');
  });

  const allAreaOptions = Array.from(areaSet).sort((a, b) => {
    const idxA = getOrderIndex(a, AREA_GROUP_OPTIONS);
    const idxB = getOrderIndex(b, AREA_GROUP_OPTIONS);
    if (idxA !== idxB) return idxA - idxB;
    return a.localeCompare(b, 'vi');
  });

  return { capitalOptions, allAreaOptions };
}

export function shouldRenderAreaSubDivider(
  capitalGroup: string,
  areaGroup: string
): boolean {
  // M. Dự án khu vực Bình Thuận doesn't have an additional Roman area sub-header in the original PDF
  if (
    capitalGroup === 'M. Dự án khu vực Bình Thuận' &&
    areaGroup === 'Khu vực Bình Thuận'
  ) {
    return false;
  }
  return true;
}
