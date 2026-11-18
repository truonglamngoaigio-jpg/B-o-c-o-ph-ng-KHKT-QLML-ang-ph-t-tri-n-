export type ProjectCategory =
  | 'Tuyến ống cấp nước'
  | 'Trạm bơm tăng áp'
  | 'Nhà máy xử lý nước'
  | 'Bể chứa & Điều hòa';

export type ReportStatus = 'on_track' | 'attention' | 'delayed';

export interface WeekPeriod {
  id: string;
  weekNumber: number;
  label: string;
  dateRange: string;
  isCurrent?: boolean;
}

export interface Supervisor {
  id: string;
  name: string;
  role: string;
  specialty: string;
  phone: string;
  initials: string;
}

export interface PipeSpec {
  id: string;
  label: string;
  approvedLengthM: number;
  baselineCompletedM?: number;
}

export interface WaterProject {
  id: string;
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
  reportLocked?: boolean;
  reportLockedAt?: string;
  reportReopenedAt?: string;
}

export interface WeeklyReport {
  id: string;
  projectId: string;
  weekId: string;
  supervisorIdAtSubmission: string | null;
  submittedAt: string;
  status: ReportStatus;
  projectStage?: string;
  cumulativeProgress: number;
  weeklyProgressDelta: number;
  weeklyVolume: string;
  summary: string;
  issues: string;
  leaderNote: string;
  pipeLengths?: Record<string, number>;
}

export interface ProjectGroupDefinition {
  capitalGroup: string;
  areas: string[];
}

export interface AppDatabaseState {
  supervisors: Supervisor[];
  projects: WaterProject[];
  reports: WeeklyReport[];
  projectGroups?: ProjectGroupDefinition[];
}

export type ActiveTab =
  | { type: 'leadership' }
  | { type: 'supervisor'; supervisorId: string };
