// 클라이언트 미리보기용 규칙 엔진 (PRD §7). 확정 전 최종 검증은 서버가 같은 규칙으로 다시 한다.
import type { Issue, Schedule, Shift, Staff, Store } from '../types';
import { dayIndex, dayLabel, fromMin, hours, snap, toMin } from './time';

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

export function coverage(store: Store, date: string, dayShifts: Shift[]): Slot[] {
  const slots: Slot[] = [];
  for (let t = toMin(store.open); t < toMin(store.close); t += SLOT) {
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

export function staffWeek(staff: Staff, schedule: Schedule, store: Store): StaffWeek {
  const shifts = schedule.shifts.filter((s) => s.staffId === staff.id);
  const confirmed = shifts.filter((s) => !s.tentative);
  const work = shifts.reduce((a, s) => a + workMin(s), 0);
  const leaveMin = schedule.leaves.filter((l) => l.staffId === staff.id).length * ANNUAL_LEAVE_MIN;

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
  weeks: Map<number, StaffWeek>;
  coverageByDate: Record<string, Slot[]>;
  totals: { workMin: number; cost: number; holidayPay: number; weeklyHolidayCount: number };
  errorCount: number;
  tentativeCount: number;
  canConfirm: boolean;
}

const overlaps = (a: Shift, b: Shift) => toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end);

export function validate(schedule: Schedule, staffList: Staff[], store: Store, dates: string[]): Validation {
  const issues: Issue[] = [];
  const weeks = new Map<number, StaffWeek>();
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

      const avail = st.availability[dayIndex(s.date)] ?? [];
      for (let h = Math.floor(toMin(s.start) / 60); h < Math.ceil(toMin(s.end) / 60); h++) {
        if (!avail.includes(h)) {
          add({ ruleId: 'R-01', severity: 'error', message: `${at} ${s.start}–${s.end} 근무 불가 시간에 배치`, ...ctx });
          break;
        }
      }
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

    const w = staffWeek(st, schedule, store);
    weeks.set(st.id, w);
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
    if (st.hourlyWage < store.minimumWage)
      add({ ruleId: 'S-06', severity: 'warning', message: `${st.name} 시급이 최저임금(${store.minimumWage.toLocaleString()}원) 미만` });
  }

  const coverageByDate: Record<string, Slot[]> = {};
  for (const date of dates) {
    coverageByDate[date] = coverage(store, date, schedule.shifts.filter((s) => s.date === date));
    for (const g of gaps(coverageByDate[date]))
      issues.push({ ruleId: 'S-01', severity: 'warning', message: `${dayLabel(date)} ${gapLabel(g)}`, date });
  }

  const ws = [...weeks.values()];
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const tentativeCount = issues.filter((i) => i.ruleId === 'T-01').length;
  return {
    issues,
    weeks,
    coverageByDate,
    totals: {
      workMin: ws.reduce((a, w) => a + w.workMin + w.tentativeMin, 0),
      cost: ws.reduce((a, w) => a + w.cost, 0),
      holidayPay: ws.reduce((a, w) => a + w.holidayPay, 0),
      weeklyHolidayCount: ws.filter((w) => w.weeklyHoliday && staffList.find((s) => s.id === w.staffId)?.employmentType === 'PART_TIME').length,
    },
    errorCount,
    tentativeCount,
    canConfirm: errorCount === 0 && tentativeCount === 0,
  };
}
