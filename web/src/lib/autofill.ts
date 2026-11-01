// AI 없이 규칙만으로 근무표 채우기
import type { Leave, Shift, Staff, Store } from '../types';
import { canWork, coverage, fixedShifts, hoursOn, SLOT, withTimes, workMin } from './rules';
import { mondayOf, toMin } from './time';

/** 알바생 주 근로 한도(분): 희망 상한, 없으면 40시간. 연소자는 35시간 이하 */
const weekCap = (st: Staff) => Math.min((st.preferredWeeklyHours?.[1] ?? 40) * 60, (st.isMinor ? 35 : 40) * 60);

/**
 * 이미 있는 근무는 그대로 두고 빈 곳만 채운다.
 * 근무 없는 날에 직원 고정 근무를 넣고, 날마다 필요 인원이 모자란 파트에 알바생을 넣는다.
 * 그 주 근무시간이 적은 사람부터 넣어 공평하게 나눈다. 연차인 날은 넣지 않는다.
 */
export function autoFill(store: Store, staff: Staff[], dates: string[], existing: Shift[], leaves: Leave[], uid: () => string): Shift[] {
  const off = (staffId: number, date: string) => leaves.some((l) => l.staffId === staffId && l.date === date);
  const shifts = [...existing];
  const taken = (staffId: number, date: string) => off(staffId, date) || shifts.some((s) => s.staffId === staffId && s.date === date);
  shifts.push(...fixedShifts(store, staff, dates, uid).filter((s) => !taken(s.staffId, s.date)));
  const used = new Map<string, number>();
  const key = (staffId: number, date: string) => `${mondayOf(date)}|${staffId}`;
  const add = (s: Shift) => used.set(key(s.staffId, s.date), (used.get(key(s.staffId, s.date)) ?? 0) + workMin(s));
  shifts.forEach(add);
  const partTimers = staff.filter((s) => s.employmentType === 'PART_TIME');

  for (const date of dates) {
    const h = hoursOn(store, date);
    for (const part of store.parts) {
      const [ps, pe] = [toMin(part.start), toMin(part.end)];
      if (ps < toMin(h.open) || pe > toMin(h.close)) continue;
      // 한 번에 한 명씩, 파트 시간대에 부족이 없어질 때까지
      for (;;) {
        const day = shifts.filter((s) => s.date === date);
        if (!coverage(store, date, day).some((sl) => sl.t >= ps && sl.t + SLOT <= pe && sl.present < sl.required)) break;
        const pick = partTimers
          .filter((st) => !taken(st.id, date) && canWork(st, store, { date, start: part.start, end: part.end, partId: part.id }))
          .map((st) => ({
            st,
            shift: withTimes({ id: uid(), staffId: st.id, date, start: '', end: '', partId: part.id, breakStart: null, breakMinutes: 0, tentative: false }, part.start, part.end),
          }))
          .filter(({ st, shift }) => (used.get(key(st.id, date)) ?? 0) + workMin(shift) <= weekCap(st) && (!st.isMinor || (workMin(shift) <= 7 * 60 && pe <= 22 * 60)))
          .sort((a, b) => (used.get(key(a.st.id, date)) ?? 0) - (used.get(key(b.st.id, date)) ?? 0))[0];
        if (!pick) break;
        shifts.push(pick.shift);
        add(pick.shift);
      }
    }
  }
  return shifts;
}
