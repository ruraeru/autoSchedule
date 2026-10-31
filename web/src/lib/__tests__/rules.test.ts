import { describe, expect, it } from 'vitest';
import { seedStaff, seedStore, seedWeek as seedSchedule } from '../../api/seed';
import type { Shift } from '../../types';
import { gaps, hoursOn, minBreakFor, requiredBreak, validate, withTimes } from '../rules';
import { storeError } from '../../pages/Settings';
import { datesBetween, monthEnd, weekDates, weeksOf } from '../time';

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
    expect(v.weeks.get(dates[0])!.get(1)).toMatchObject({ workMin: 40 * 60, tentativeMin: 0, overtimeMin: 0 });
    expect(v.weeks.get(dates[0])!.get(2)).toMatchObject({ workMin: 24 * 60, tentativeMin: 8 * 60, leaveMin: 8 * 60 });
  });

  it('커버리지 부족: 오픈 혼자인 목·일 휴게 구간과 금 19:30–20:00', () => {
    const all = dates.flatMap((d) => gaps(v.coverageByDate[d]).map((g) => ({ d, ...g })));
    expect(all).toEqual([
      { d: '2026-11-05', start: 10 * 60, end: 10 * 60 + 30, shortage: 1 },
      { d: FRI, start: 19 * 60 + 30, end: 20 * 60, shortage: 1 },
      { d: '2026-11-08', start: 10 * 60, end: 10 * 60 + 30, shortage: 1 },
    ]);
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

describe('한 달 기간', () => {
  it('말일과 월~일 주 나누기: 달 경계 밖 요일은 비운다', () => {
    expect(monthEnd('2026-02-01')).toBe('2026-02-28');
    const weeks = weeksOf(datesBetween('2026-11-01', monthEnd('2026-11-01')));
    expect(weeks).toHaveLength(6);
    expect(weeks[0]).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(weeks[5][0]).toBe('2026-11-30');
    expect(weeks[5].slice(1).every((d) => d === null)).toBe(true);
  });

  it('주간 집계는 주마다 따로 한다', () => {
    const month = datesBetween('2026-11-01', '2026-11-30');
    const v = validate(seedSchedule, seedStaff, seedStore, month);
    expect(v.weeks.size).toBe(6);
    expect(v.weeks.get('2026-11-02')!.get(1)!.workMin).toBe(40 * 60);
    expect(v.weeks.get('2026-11-09')!.get(1)!.workMin).toBe(0);
  });
});

describe('매장 설정 검증', () => {
  it('영업시간·파트 시간이 어긋나면 저장을 막는다', () => {
    expect(storeError(seedStore)).toBeNull();
    expect(storeError({ ...seedStore, open: '22:00', close: '08:00' })).toMatch('평일 영업 종료');
    expect(storeError({ ...seedStore, weekendOpen: '23:00' })).toMatch('주말·공휴일');
    const late = { ...seedStore.parts[2], end: '23:00' };
    expect(storeError({ ...seedStore, parts: [late] })).toMatch('영업시간 안');
    expect(storeError({ ...seedStore, parts: [{ ...late, name: ' ' }] })).toMatch('이름');
  });
});

describe('영업시간 평일 / 주말·공휴일', () => {
  it('토·일과 공휴일은 주말 영업시간을 쓴다', () => {
    const store = { ...seedStore, weekendOpen: '10:00', weekendClose: '20:00' };
    expect(hoursOn(store, '2026-11-06')).toEqual({ open: '08:00', close: '22:00' }); // 금
    expect(hoursOn(store, '2026-11-07')).toEqual({ open: '10:00', close: '20:00' }); // 토
    expect(hoursOn(store, '2026-10-09')).toEqual({ open: '10:00', close: '20:00' }); // 한글날(금)
  });
});
