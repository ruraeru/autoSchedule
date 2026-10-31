// 하루 커버리지 부족을 휴게 위치 조정만으로 메우는 제안. 근무 시간·인건비는 바꾸지 않는다.
import type { Shift, Store } from '../types';
import { breakWindow, requiredAt, SLOT } from './rules';
import { fromMin, toMin } from './time';

export interface BreakMove {
  shiftId: string;
  staffId: number;
  from: string;
  to: string;
}

export interface BreakSuggestion {
  moves: BreakMove[];
  shortageBefore: number;
  shortageAfter: number;
}

const MAX_COMBINATIONS = 300_000;

export function suggestBreakMoves(store: Store, date: string, dayShifts: Shift[]): BreakSuggestion | null {
  const open = toMin(store.open);
  const n = (toMin(store.close) - open) / SLOT;
  const required = Array.from({ length: n }, (_, i) => requiredAt(store, date, open + i * SLOT));

  // 휴게를 빼지 않은 출근 인원
  const base = new Array<number>(n).fill(0);
  for (const s of dayShifts)
    for (let i = 0; i < n; i++) {
      const t = open + i * SLOT;
      if (t >= toMin(s.start) && t + SLOT <= toMin(s.end)) base[i]++;
    }

  const movable = dayShifts.filter((s) => s.breakMinutes > 0 && s.breakStart);
  /** 휴게를 t에 두면 빠지는 슬롯 */
  const removed = (s: Shift, t: number) => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const st = open + i * SLOT;
      if (st >= toMin(s.start) && st + SLOT <= toMin(s.end) && st < t + s.breakMinutes && st + SLOT > t) out.push(i);
    }
    return out;
  };
  const candidates = movable.map((s) => {
    const [lo, hi] = breakWindow(s);
    const ts: number[] = [];
    for (let t = lo; t <= hi; t += SLOT) ts.push(t);
    const cur = toMin(s.breakStart!);
    if (!ts.includes(cur)) ts.push(cur);
    return ts.map((t) => ({ t, slots: removed(s, t), dist: Math.abs(t - cur) }));
  });

  const counts = new Array<number>(n);
  const shortageOf = (choice: number[]) => {
    for (let i = 0; i < n; i++) counts[i] = base[i];
    choice.forEach((c, k) => candidates[k][c].slots.forEach((i) => counts[i]--));
    let short = 0;
    for (let i = 0; i < n; i++) short += Math.max(0, required[i] - counts[i]);
    return short;
  };
  // 부족 인원 → 옮긴 휴게 수 → 이동 거리 순으로 최소화
  const score = (choice: number[], short: number) => {
    let moved = 0;
    let dist = 0;
    choice.forEach((c, k) => {
      const d = candidates[k][c].dist;
      if (d) moved++;
      dist += d;
    });
    return short * 1_000_000 + moved * 1_000 + dist / 15;
  };

  let best = candidates.map((list) => list.findIndex((c) => c.dist === 0));
  const before = shortageOf(best);
  if (before === 0) return null;
  let bestShort = before;
  let bestScore = score(best, before);
  const consider = (choice: number[]) => {
    const short = shortageOf(choice);
    const sc = score(choice, short);
    if (sc >= bestScore) return false;
    [best, bestShort, bestScore] = [[...choice], short, sc];
    return true;
  };

  if (candidates.reduce((a, c) => a * c.length, 1) <= MAX_COMBINATIONS) {
    const choice: number[] = [];
    const walk = (k: number) => {
      if (k === candidates.length) return void consider(choice);
      for (let c = 0; c < candidates[k].length; c++) {
        choice[k] = c;
        walk(k + 1);
      }
    };
    walk(0);
  } else {
    // 인원이 많은 날: 휴게 하나씩 옮기는 좌표 하강
    let improved = true;
    while (improved) {
      improved = false;
      candidates.forEach((list, k) =>
        list.forEach((_, c) => {
          const choice = [...best];
          choice[k] = c;
          if (consider(choice)) improved = true;
        }),
      );
    }
  }

  if (bestShort >= before) return null;
  const moves = movable
    .map((s, k) => ({ shiftId: s.id, staffId: s.staffId, from: s.breakStart!, to: fromMin(candidates[k][best[k]].t) }))
    .filter((m) => m.from !== m.to);
  return { moves, shortageBefore: before, shortageAfter: bestShort };
}
