// 백엔드 API(PRD §9, §10) 응답 형태를 따른다. 시각은 "HH:MM", 날짜는 "YYYY-MM-DD".

/** FULL_TIME = 직원(유동 근무, 계약 주 근로시간), PART_TIME = 알바생(파트 근무) */
export type EmploymentType = 'FULL_TIME' | 'PART_TIME';

export interface Staff {
  id: number;
  name: string;
  employmentType: EmploymentType;
  /** 화면 표시용 직함: 매니저, 정직원, 알바 등 */
  title: string;
  hourlyWage: number;
  isMinor: boolean;
  /** 직원만 사용. 주 소정근로시간 */
  contractWeeklyHours: number | null;
  /** 알바생만 사용. 희망 주간 근무시간 [최소, 최대] */
  preferredWeeklyHours: [number, number] | null;
  /** 요일(0=월)별 근무 가능한 시작 시(hour) 목록. 예: [8, 9, 10] = 08~11시 가능 */
  availability: number[][];
  phone: string;
}

export type PartTone = 'open' | 'middle' | 'close';

export interface Part {
  id: string;
  name: string;
  tone: PartTone;
  start: string;
  end: string;
  breakMinutes: number;
}

/** 시간대별 필요 인원. 커버리지 계산 기준 */
export interface DemandBlock {
  start: string;
  end: string;
  required: number;
  /** 지정 요일(0=월)에만 적용. 없으면 매일. 겹치면 큰 값 */
  days?: number[];
}

export interface Store {
  id: number;
  name: string;
  branch: string;
  size: 'UNDER_5' | 'OVER_5';
  open: string;
  close: string;
  parts: Part[];
  demand: DemandBlock[];
  minimumWage: number;
}

export interface Shift {
  id: string;
  staffId: number;
  date: string;
  start: string;
  end: string;
  /** 알바생 파트 근무면 파트 id, 직원 유동 근무면 null */
  partId: string | null;
  breakStart: string | null;
  breakMinutes: number;
  /** 직원 근무 시간 미정. start/end는 AI 추천값 */
  tentative: boolean;
}

export interface Leave {
  id: string;
  staffId: number;
  date: string;
  type: 'ANNUAL';
}

export type WeeklyHolidayPolicy = 'MINIMIZE' | 'ALLOW';
export type Priority = 'FAIRNESS' | 'COST';

export interface Schedule {
  id: number;
  periodStart: string;
  periodEnd: string;
  status: 'DRAFT' | 'CONFIRMED';
  source: 'AI' | 'TEMPLATE' | 'MANUAL';
  policy: { weeklyHolidayPay: WeeklyHolidayPolicy; priority: Priority };
  shifts: Shift[];
  leaves: Leave[];
  aiComment: string;
  updatedAt: string;
}

export interface GenerateRequest {
  periodStart: string;
  weeklyHolidayPay: WeeklyHolidayPolicy;
  priority: Priority;
  /** 직원 계약 근로시간을 우선 채운다 */
  fillContractHours: boolean;
}

export interface Template {
  id: number;
  name: string;
  createdAt: string;
  /** 날짜 대신 요일(0=월)로 저장해 다른 주에 적용한다 */
  shifts: (Omit<Shift, 'id' | 'date'> & { dayIndex: number })[];
  leaves: (Omit<Leave, 'id' | 'date'> & { dayIndex: number })[];
}

export type Severity = 'error' | 'warning' | 'info';

export interface Issue {
  ruleId: string;
  severity: Severity;
  message: string;
  staffId?: number;
  shiftId?: string;
  date?: string;
}
