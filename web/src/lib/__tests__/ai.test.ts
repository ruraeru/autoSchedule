import { describe, expect, it } from 'vitest';
import type { GenerateRequest } from '../../types';
import { buildPrompt, toShifts } from '../ai';
import { seedStaff, seedStore } from './fixtures';

const req: GenerateRequest = { periodStart: '2026-11-01', weeklyHolidayPay: 'MINIMIZE', priority: 'FAIRNESS', fillContractHours: true };
const input = { store: seedStore, staff: seedStaff, req };
let n = 0;
const uid = () => `t${++n}`;

describe('Gemini 응답 검증', () => {
  it('규칙에 맞는 근무만 남기고 휴게를 채운다', () => {
    const shifts = toShifts(
      {
        comment: '',
        shifts: [
          { staffId: 1, date: '2026-11-02', start: '09:07', end: '18:00', partId: null }, // 직원: 15분 단위로 맞춤
          { staffId: 3, date: '2026-11-02', start: '01:00', end: '02:00', partId: 'OPEN' }, // 알바: 파트 시각으로 바꿈
          { staffId: 3, date: '2026-11-02', start: '08:00', end: '12:00', partId: 'OPEN' }, // 같은 날 두 번째 → 버림
          { staffId: 99, date: '2026-11-02', start: '08:00', end: '12:00', partId: 'OPEN' }, // 없는 사람
          { staffId: 4, date: '2026-12-01', start: '12:00', end: '17:00', partId: 'MIDDLE' }, // 기간 밖
          { staffId: 4, date: '2026-11-03', start: '12:00', end: '17:00', partId: 'NOPE' }, // 없는 파트
          { staffId: 2, date: '2026-11-03', start: '06:00', end: '15:00', partId: null }, // 영업시간 밖
          { staffId: 5, date: '2026-11-07', start: '17:00', end: '22:00', partId: 'CLOSE' }, // 박하은 토요일 마감 불가
        ],
      },
      input,
      uid,
    );
    expect(shifts.map((s) => [s.staffId, s.start, s.end, s.partId, s.breakMinutes])).toEqual([
      [1, '09:00', '18:00', null, 60],
      [3, '08:00', '12:00', 'OPEN', 30],
    ]);
  });

  it('프롬프트에는 이름·연락처가 없다', () => {
    const p = buildPrompt(input);
    for (const s of seedStaff) {
      expect(p).not.toContain(s.name);
      expect(p).not.toContain(s.phone);
    }
    expect(p).toContain('#1 직원');
  });
});

it('고정 근무 시간이 있는 직원은 그 시각으로 맞춘다', () => {
  const staff = seedStaff.map((s) => (s.id === 1 ? { ...s, workHours: { start: '10:00', end: '19:00' } } : s));
  const [s] = toShifts({ comment: '', shifts: [{ staffId: 1, date: '2026-11-02', start: '08:00', end: '20:00', partId: null }] }, { ...input, staff }, uid);
  expect([s.start, s.end, s.breakMinutes]).toEqual(['10:00', '19:00', 60]);
});
