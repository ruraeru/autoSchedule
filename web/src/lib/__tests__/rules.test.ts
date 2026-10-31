import { describe, expect, it } from 'vitest';
import { seedSchedule, seedStaff, seedStore } from '../../api/seed';
import type { Shift } from '../../types';
import { gaps, minBreakFor, requiredBreak, validate, withTimes } from '../rules';
import { suggestBreakMoves } from '../suggest';
import { weekDates } from '../time';

const dates = weekDates(seedSchedule.periodStart);
const FRI = '2026-11-06';

describe('휴게시간 (R-04)', () => {
  it('근로 4시간 이상 30분, 8시간 이상 1시간', () => {
    expect(requiredBreak(239)).toBe(0);
    expect(requiredBreak(240)).toBe(30);
    expect(requiredBreak(480)).toBe(60);
  });
  it('체류 시간 기준 최소 휴게', () => {
    expect(minBreakFor(210)).toBe(0); // 3.5h
    expect(minBreakFor(240)).toBe(30); // 4h → 3.5h 근로
    expect(minBreakFor(540)).toBe(60); // 9h → 8h 근로
  });
  it('출퇴근을 바꾸면 휴게를 다시 맞춘다', () => {
    const s: Shift = { id: 'x', staffId: 1, date: FRI, start: '09:00', end: '12:00', partId: null, breakStart: null, breakMinutes: 0, tentative: false };
    const next = withTimes(s, '09:00', '18:00');
    expect(next.breakMinutes).toBe(60);
    expect(next.breakStart).toBe('13:00');
  });
});

describe('예시 근무표 검증', () => {
  const v = validate(seedSchedule, seedStaff, seedStore, dates);

  it('위반은 박하은 토요일 가능 시간 외 배치 1건', () => {
    const errors = v.issues.filter((i) => i.severity === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ ruleId: 'R-01', staffId: 5, date: '2026-11-07' });
  });

  it('서하린 토요일 시간 미정 → 확정 불가', () => {
    expect(v.tentativeCount).toBe(1);
    expect(v.canConfirm).toBe(false);
  });

  it('직원 주간 집계: 확정·미정·연차를 나눠 센다', () => {
    expect(v.weeks.get(1)).toMatchObject({ workMin: 40 * 60, tentativeMin: 0, overtimeMin: 0 });
    expect(v.weeks.get(2)).toMatchObject({ workMin: 24 * 60, tentativeMin: 8 * 60, leaveMin: 8 * 60 });
  });

  it('커버리지 부족은 금 19:30–20:00 1명뿐', () => {
    const all = dates.flatMap((d) => gaps(v.coverageByDate[d]).map((g) => ({ d, ...g })));
    expect(all).toEqual([{ d: FRI, start: 19 * 60 + 30, end: 20 * 60, shortage: 1 }]);
  });
});

describe('휴게 조정 제안', () => {
  it('강지호 휴게를 옮겨 금요일 부족을 없앤다', () => {
    const fri = seedSchedule.shifts.filter((s) => s.date === FRI);
    const sug = suggestBreakMoves(seedStore, FRI, fri)!;
    expect(sug.shortageAfter).toBe(0);
    expect(sug.moves).toEqual([expect.objectContaining({ staffId: 8, from: '19:30' })]);

    const moved = seedSchedule.shifts.map((s) => {
      const m = sug.moves.find((x) => x.shiftId === s.id);
      return m ? { ...s, breakStart: m.to } : s;
    });
    const after = validate({ ...seedSchedule, shifts: moved }, seedStaff, seedStore, dates);
    expect(gaps(after.coverageByDate[FRI])).toEqual([]);
  });

  it('부족이 없으면 제안하지 않는다', () => {
    const mon = seedSchedule.shifts.filter((s) => s.date === '2026-11-02');
    expect(suggestBreakMoves(seedStore, '2026-11-02', mon)).toBeNull();
  });
});

describe('연소자 (R-05, R-06)', () => {
  it('1일 7시간 초과와 22시 이후 근무를 막는다', () => {
    const minor: Shift = { id: 'm', staffId: 10, date: FRI, start: '13:00', end: '22:30', partId: null, breakStart: '17:00', breakMinutes: 60, tentative: false };
    const v = validate({ ...seedSchedule, shifts: [minor] }, seedStaff, seedStore, dates);
    const ids = v.issues.filter((i) => i.staffId === 10 && i.severity === 'error').map((i) => i.ruleId);
    expect(ids).toEqual(expect.arrayContaining(['R-05', 'R-06']));
  });
});
