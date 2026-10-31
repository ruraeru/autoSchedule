// 클라이언트 미리보기용 규칙 엔진 (PRD §7). 확정 전 최종 검증은 서버가 같은 규칙으로 다시 한다.
import type { Issue, Schedule, Shift, Staff, Store } from '../types';
import { dayIndex, dayLabel, fromMin, hours, isWeekendOrHoliday, snap, toMin, weeksOf } from './time';

export const SLOT = 30;
const WEEKLY_HOLIDAY_MIN = 15 * 60;
const WEEK_LIMIT = 40 * 60;
const DAY_LIMIT = 8 * 60;
const OVERTIME_LIMIT = 12 * 60;
const MINOR_DAY_LIMIT = 7 * 60;
const MINOR_WEEK_LIMIT = 35 * 60;
const ANNUAL_LEAVE_MIN = 8 * 60;
/** 휴게는 출근 직후·퇴근 직전 30분에 둘 수 없다 */
const BREAK_MARGIN = 30;

export const durationMin = (s: Pick<Shift, 'start' | 'end'>) => toMin(s.end) - toMin(s.start);
export const workMin = (s: Shift) => durationMin(s) - s.breakMinutes;

/** 근로기준법 제54조: 4시간 이상 30분, 8시간 이상 1시간 */
export const requiredBreak = (work: number) => (work >= 480 ? 60 : work >= 240 ? 30 : 0);

/** 체류 시간(출근~퇴근)에 필요한 최소 휴게 */
export const minBreakFor = (duration: number) => [0, 30, 60].find((b) => b >= requiredBreak(duration - b)) ?? 60;

export function breakWindow(s: Pick<Shift, 'start' | 'end' | 'breakMinutes'>): [number, number] {
  return [toMin(s.start) + BREAK_MARGIN, toMin(s.end) - BREAK_MARGIN - s.breakMinutes];
}

/** 휴게 위치를 허용 구간 안으로 맞춘다. 위치가 없으면 근무 중간. */
export function placeBreak(s: Shift): Shift {
  if (!s.breakMinutes) return { ...s, breakStart: null };
  const [lo, hi] = breakWindow(s);
  const mid = snap((toMin(s.start) + toMin(s.end) - s.breakMinutes) / 2, SLOT);
  if (hi < lo) return { ...s, breakStart: fromMin(snap((toMin(s.start) + toMin(s.end) - s.breakMinutes) / 2)) };
  const st = s.breakStart ? toMin(s.breakStart) : mid;
  return { ...s, breakStart: fromMin(Math.min(Math.max(st, lo), hi)) };
}

/** 출퇴근 시각을 바꾸고 법정 최소 휴게를 다시 반영한다 */
export const withTimes = (s: Shift, start: string, end: string): Shift =>
  placeBreak({ ...s, start, end, breakMinutes: minBreakFor(toMin(end) - toMin(start)) });

export function breakRange(s: Shift): [number, number] | null {
  if (!s.breakMinutes || !s.breakStart) return null;
  const st = toMin(s.breakStart);
  return [st, st + s.breakMinutes];
}

/** [t, t+SLOT) 구간에 실제로 일하는지 (휴게 제외) */
export function isWorking(s: Shift, t: number) {
  if (t < toMin(s.start) || t + SLOT > toMin(s.end)) return false;
  const br = breakRange(s);
  return !(br && t < br[1] && t + SLOT > br[0]);
}

// ---------- 커버리지 ----------

export interface Slot {
  t: number;
  required: number;
  present: number;
}

export function requiredAt(store: Store, date: string, t: number) {
  const day = dayIndex(date);
  return Math.max(
    0,
    ...store.demand
      .filter((d) => (!d.days || d.days.includes(day)) && toMin(d.start) <= t && t < toMin(d.end))
      .map((d) => d.required),
  );
}

/**
 * 알바생은 그 요일에 고른 파트만 근무 가능. 파트 없이 직접 입력한 근무는 고른 파트들 시간 안이면 된다.
 * 직원은 언제나 가능.
 */
export function canWork(st: Staff, store: Store, s: Pick<Shift, 'date' | 'start' | 'end' | 'partId'>) {
  if (st.employmentType === 'FULL_TIME') return true;
  const ids = st.availableParts[dayIndex(s.date)] ?? [];
  if (s.partId) return ids.includes(s.partId);
  const parts = store.parts.filter((p) => ids.includes(p.id));
  for (let t = toMin(s.start); t < toMin(s.end); t += 15)
    if (!parts.some((p) => toMin(p.start) <= t && t < toMin(p.end))) return false;
  return true;
}

/** 그 날의 영업시간 (평일 / 주말·공휴일) */
export const hoursOn = (store: Store, date: string) =>
  isWeekendOrHoliday(date) ? { open: store.weekendOpen, close: store.weekendClose } : { open: store.open, close: store.close };

/** 평일·주말을 모두 덮는 시각 범위(분) */
export const hoursSpan = (store: Store) => ({
  open: Math.min(toMin(store.open), toMin(store.weekendOpen)),
  close: Math.max(toMin(store.close), toMin(store.weekendClose)),
});

export function coverage(store: Store, date: string, dayShifts: Shift[]): Slot[] {
  const slots: Slot[] = [];
  const { open, close } = hoursOn(store, date);
  for (let t = toMin(open); t < toMin(close); t += SLOT) {
    slots.push({ t, required: requiredAt(store, date, t), present: dayShifts.filter((s) => isWorking(s, t)).length });
  }
  return slots;
}

export interface Gap {
  start: number;
  end: number;
  shortage: number;
}

/** 연속된 부족 슬롯을 하나의 구간으로 묶는다 */
export function gaps(slots: Slot[]): Gap[] {
  const out: Gap[] = [];
  for (const s of slots) {
    const short = s.required - s.present;
    if (short <= 0) continue;
    const last = out[out.length - 1];
    if (last && last.end === s.t && last.shortage === short) last.end = s.t + SLOT;
    else out.push({ start: s.t, end: s.t + SLOT, shortage: short });
  }
  return out;
}

export const gapLabel = (g: Gap) => `${fromMin(g.start)}–${fromMin(g.end)} ${g.shortage}명 부족`;

// ---------- 주간 집계 ----------

export interface StaffWeek {
  staffId: number;
  workMin: number;
  tentativeMin: number;
  leaveMin: number;
  overtimeMin: number;
  weeklyHoliday: boolean;
  holidayPay: number;
  cost: number;
}

/** dates: 집계할 한 주(월~일)의 날짜. 달 경계에 걸린 주는 그 달 날짜만 센다 */
export function staffWeek(staff: Staff, schedule: Schedule, store: Store, dates: string[]): StaffWeek {
  const inWeek = new Set(dates);
  const shifts = schedule.shifts.filter((s) => s.staffId === staff.id && inWeek.has(s.date));
  const confirmed = shifts.filter((s) => !s.tentative);
  const work = shifts.reduce((a, s) => a + workMin(s), 0);
  const leaveMin = schedule.leaves.filter((l) => l.staffId === staff.id && inWeek.has(l.date)).length * ANNUAL_LEAVE_MIN;

  let overtimeMin = 0;
  if (store.size === 'OVER_5') {
    const byDay = new Map<string, number>();
    shifts.forEach((s) => byDay.set(s.date, (byDay.get(s.date) ?? 0) + workMin(s)));
    const dailyOver = [...byDay.values()].reduce((a, m) => a + Math.max(0, m - DAY_LIMIT), 0);
    overtimeMin = Math.max(dailyOver, work - WEEK_LIMIT, 0);
  }

  // 주휴: 1주 소정근로 15시간 이상. 연차일은 출근으로 본다.
  const weeklyHoliday = work + leaveMin >= WEEKLY_HOLIDAY_MIN;
  const holidayPay = weeklyHoliday ? (Math.min(work + leaveMin, WEEK_LIMIT) / WEEK_LIMIT) * 8 * staff.hourlyWage : 0;
  const premium = store.size === 'OVER_5' ? (overtimeMin / 60) * staff.hourlyWage * 0.5 : 0;
  const cost = ((work + leaveMin) / 60) * staff.hourlyWage + holidayPay + premium;

  return {
    staffId: staff.id,
    workMin: confirmed.reduce((a, s) => a + workMin(s), 0),
    tentativeMin: work - confirmed.reduce((a, s) => a + workMin(s), 0),
    leaveMin,
    overtimeMin,
    weeklyHoliday,
    holidayPay,
    cost,
  };
}

// ---------- 검증 ----------

export interface Validation {
  issues: Issue[];
  /** 주 첫 날짜 → 직원별 주간 집계 */
  weeks: Map<string, Map<number, StaffWeek>>;
  coverageByDate: Record<string, Slot[]>;
  totals: { workMin: number; cost: number; holidayPay: number; weeklyHolidayCount: number };
  tentativeCount: number;
  canConfirm: boolean;
}

const overlaps = (a: Shift, b: Shift) => toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end);

export function validate(schedule: Schedule, staffList: Staff[], store: Store, dates: string[]): Validation {
  const issues: Issue[] = [];
  const weeks = new Map<string, Map<number, StaffWeek>>();
  const weekList = weeksOf(dates).map((w) => w.filter((d): d is string => d !== null));
  for (const w of weekList) weeks.set(w[0], new Map());
  const over5 = store.size === 'OVER_5';

  for (const st of staffList) {
    const mine = schedule.shifts
      .filter((s) => s.staffId === st.id)
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    const leaveDates = new Set(schedule.leaves.filter((l) => l.staffId === st.id).map((l) => l.date));
    const add = (i: Omit<Issue, 'staffId'>) => issues.push({ ...i, staffId: st.id });

    mine.forEach((s, i) => {
      const at = `${st.name} ${dayLabel(s.date)}`;
      const ctx = { shiftId: s.id, date: s.date };
      if (s.tentative) add({ ruleId: 'T-01', severity: 'info', message: `${at} 근무 시간 미정`, ...ctx });

      if (!canWork(st, store, s)) add({ ruleId: 'R-01', severity: 'error', message: `${at} ${s.start}–${s.end} 근무 가능 파트가 아님`, ...ctx });
      if (mine.slice(i + 1).some((o) => o.date === s.date && overlaps(s, o)))
        add({ ruleId: 'R-02', severity: 'error', message: `${at} 근무 시간 중복`, ...ctx });
      if (leaveDates.has(s.date)) add({ ruleId: 'R-02', severity: 'error', message: `${at} 연차일에 근무 배치`, ...ctx });
      if (s.breakMinutes < requiredBreak(workMin(s)))
        add({ ruleId: 'R-04', severity: 'error', message: `${at} 휴게 ${requiredBreak(workMin(s))}분 이상 필요`, ...ctx });
      if (st.isMinor && (toMin(s.start) < 6 * 60 || toMin(s.end) > 22 * 60))
        add({ ruleId: 'R-06', severity: 'error', message: `${at} 연소자 22시 이후 근무 불가`, ...ctx });
      if (over5 && !st.isMinor && toMin(s.end) > 22 * 60)
        add({ ruleId: 'S-04', severity: 'warning', message: `${at} 야간근로 가산수당 50% 발생`, ...ctx });
    });

    const byDay = new Map<string, number>();
    mine.forEach((s) => byDay.set(s.date, (byDay.get(s.date) ?? 0) + workMin(s)));
    for (const [date, m] of byDay) {
      if (st.isMinor && m > MINOR_DAY_LIMIT)
        add({ ruleId: 'R-05', severity: 'error', message: `${st.name} ${dayLabel(date)} 연소자 1일 7시간 초과 (${hours(m)})`, date });
      else if (over5 && m > DAY_LIMIT)
        add({ ruleId: 'R-03', severity: 'warning', message: `${st.name} ${dayLabel(date)} 1일 8시간 초과, 연장 ${hours(m - DAY_LIMIT)}`, date });
    }

    for (const days of weekList) {
      const w = staffWeek(st, schedule, store, days);
      weeks.get(days[0])!.set(st.id, w);
      const total = w.workMin + w.tentativeMin;
      if (st.isMinor && total > MINOR_WEEK_LIMIT)
        add({ ruleId: 'R-05', severity: 'error', message: `${st.name} 연소자 주 35시간 초과 (${hours(total)})` });
      if (over5 && w.overtimeMin > OVERTIME_LIMIT)
        add({ ruleId: 'R-03', severity: 'error', message: `${st.name} 주 연장근로 12시간 초과 (${hours(w.overtimeMin)})` });
      if (st.employmentType === 'FULL_TIME' && st.contractWeeklyHours && total + w.leaveMin < st.contractWeeklyHours * 60)
        add({
          ruleId: 'S-07',
          severity: 'warning',
          message: `${st.name} 계약 ${st.contractWeeklyHours}h 중 ${hours(total + w.leaveMin)}만 배정`,
        });
      if (st.employmentType === 'PART_TIME') {
        if (schedule.policy.weeklyHolidayPay === 'MINIMIZE' && w.weeklyHoliday)
          add({ ruleId: 'S-02', severity: 'warning', message: `${st.name} 주 ${hours(total)} — 주휴수당 발생` });
        const pref = st.preferredWeeklyHours;
        if (pref && total > 0 && (total < pref[0] * 60 || total > pref[1] * 60))
          add({ ruleId: 'S-03', severity: 'warning', message: `${st.name} 희망 ${pref[0]}–${pref[1]}h 범위 밖 (${hours(total)})` });
      }
    }
    if (st.hourlyWage < store.minimumWage)
      add({ ruleId: 'S-06', severity: 'warning', message: `${st.name} 시급이 최저임금(${store.minimumWage.toLocaleString()}원) 미만` });
  }

  const coverageByDate: Record<string, Slot[]> = {};
  for (const date of dates) {
    coverageByDate[date] = coverage(store, date, schedule.shifts.filter((s) => s.date === date));
    for (const g of gaps(coverageByDate[date]))
      issues.push({ ruleId: 'S-01', severity: 'warning', message: `${dayLabel(date)} ${gapLabel(g)}`, date });
  }

  const ws = [...weeks.values()].flatMap((m) => [...m.values()]);
  const tentativeCount = issues.filter((i) => i.ruleId === 'T-01').length;
  return {
    issues,
    weeks,
    coverageByDate,
    totals: {
      workMin: ws.reduce((a, w) => a + w.workMin + w.tentativeMin, 0),
      cost: ws.reduce((a, w) => a + w.cost, 0),
      holidayPay: ws.reduce((a, w) => a + w.holidayPay, 0),
      weeklyHolidayCount: new Set(ws.filter((w) => w.weeklyHoliday && staffList.find((s) => s.id === w.staffId)?.employmentType === 'PART_TIME').map((w) => w.staffId)).size,
    },
    tentativeCount,
    canConfirm: tentativeCount === 0,
  };
}
