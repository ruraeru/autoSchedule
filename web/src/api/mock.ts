// 백엔드 없이 동작하는 메모리 DB. localStorage에 보관해 새로고침해도 유지한다.
import { datesBetween, dayIndex, monthEnd, weeksOf } from '../lib/time';
import type { GenerateRequest, Schedule, Shift, Staff, Store, Template } from '../types';
import { seedStaff, seedStore, seedWeek } from './seed';

// v4: 평일 / 주말·공휴일 영업시간 분리
const KEY = 'autoschedule-mock-v4';

interface Db {
  store: Store;
  staff: Staff[];
  schedules: Schedule[];
  templates: Template[];
}

const uid = () => crypto.randomUUID();

type Pattern = Pick<Template, 'shifts' | 'leaves'>;

/** 근무표의 첫 번째 온전한 주(월~일)를 요일 패턴으로 */
function toPattern(s: Schedule): Pattern {
  const week = weeksOf(datesBetween(s.periodStart, s.periodEnd)).find((w) => w.every(Boolean)) ?? [];
  const strip = <T extends { id: string; date: string }>({ id: _id, date, ...rest }: T) => ({ ...rest, dayIndex: dayIndex(date) });
  return {
    shifts: s.shifts.filter((x) => week.includes(x.date)).map(strip) as Pattern['shifts'],
    leaves: s.leaves.filter((x) => week.includes(x.date)).map(strip) as Pattern['leaves'],
  };
}

/** 요일 패턴을 그 달 같은 요일마다 반복. 연차는 그 요일 첫 날에만 둔다 */
function fillMonth(start: string, p: Pattern): Pick<Schedule, 'periodStart' | 'periodEnd' | 'shifts' | 'leaves'> {
  const dates = datesBetween(start, monthEnd(start));
  return {
    periodStart: start,
    periodEnd: monthEnd(start),
    shifts: dates.flatMap((date) => p.shifts.filter((s) => s.dayIndex === dayIndex(date)).map(({ dayIndex: _d, ...rest }): Shift => ({ ...rest, id: uid(), date }))),
    leaves: p.leaves.flatMap(({ dayIndex: d, ...rest }) => {
      const date = dates.find((x) => dayIndex(x) === d);
      return date ? [{ ...rest, id: uid(), date }] : [];
    }),
  };
}

const fresh = (): Db =>
  structuredClone({ store: seedStore, staff: seedStaff, schedules: [{ ...seedWeek, ...fillMonth('2026-11-01', toPattern(seedWeek)) }], templates: [] });

function load(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Db;
  } catch {
    // 저장소 접근 불가(사생활 보호 모드 등) → 시드 사용
  }
  return fresh();
}

let db = load();

const persist = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    // 저장 실패는 무시: 메모리 상태로 계속 동작
  }
};

const delay = <T>(value: T, ms = 250) => new Promise<T>((r) => setTimeout(() => r(structuredClone(value)), ms));
const notFound = () => Promise.reject(new Error('찾을 수 없습니다'));
export const mock = {
  getStore: () => delay(db.store),
  updateStore(store: Store) {
    db.store = store;
    persist();
    return delay(store);
  },

  listStaff: () => delay(db.staff),
  saveStaff(staff: Staff) {
    if (staff.id) db.staff = db.staff.map((s) => (s.id === staff.id ? staff : s));
    else db.staff.push({ ...staff, id: Math.max(0, ...db.staff.map((s) => s.id)) + 1 });
    persist();
    return delay(staff);
  },
  deleteStaff(id: number) {
    db.staff = db.staff.filter((s) => s.id !== id);
    db.schedules.forEach((sc) => {
      sc.shifts = sc.shifts.filter((s) => s.staffId !== id);
      sc.leaves = sc.leaves.filter((l) => l.staffId !== id);
    });
    persist();
    return delay(null);
  },

  listSchedules: () => delay([...db.schedules].sort((a, b) => b.periodStart.localeCompare(a.periodStart))),
  getSchedule(id: number) {
    const s = db.schedules.find((x) => x.id === id);
    return s ? delay(s) : notFound();
  },
  saveSchedule(id: number, body: Pick<Schedule, 'shifts' | 'leaves'>) {
    const s = db.schedules.find((x) => x.id === id);
    if (!s) return notFound();
    Object.assign(s, body, { updatedAt: new Date().toISOString() });
    persist();
    return delay(s);
  },
  confirmSchedule(id: number) {
    const s = db.schedules.find((x) => x.id === id);
    if (!s) return notFound();
    s.status = 'CONFIRMED';
    persist();
    return delay(s);
  },

  /** 서버에서는 Gemini 생성 + 규칙 검증 루프. 목업은 시드 주의 요일 패턴을 요청한 달에 반복해 돌려준다. */
  generateSchedule(req: GenerateRequest) {
    const schedule: Schedule = {
      ...structuredClone(seedWeek),
      ...fillMonth(req.periodStart, toPattern(seedWeek)),
      id: Math.max(0, ...db.schedules.map((s) => s.id)) + 1,
      policy: { weeklyHolidayPay: req.weeklyHolidayPay, priority: req.priority },
      updatedAt: new Date().toISOString(),
    };
    db.schedules = db.schedules.filter((s) => s.periodStart !== req.periodStart || s.status === 'CONFIRMED');
    db.schedules.push(schedule);
    persist();
    return delay(schedule, 2400);
  },

  listTemplates: () => delay(db.templates),
  saveTemplate(name: string, scheduleId: number) {
    const s = db.schedules.find((x) => x.id === scheduleId);
    if (!s) return notFound();
    const t: Template = {
      id: Math.max(0, ...db.templates.map((x) => x.id)) + 1,
      name,
      createdAt: new Date().toISOString(),
      ...toPattern(s),
    };
    db.templates.push(t);
    persist();
    return delay(t);
  },
  deleteTemplate(id: number) {
    db.templates = db.templates.filter((t) => t.id !== id);
    persist();
    return delay(null);
  },
  applyTemplate(id: number, periodStart: string) {
    const t = db.templates.find((x) => x.id === id);
    if (!t) return notFound();
    const schedule: Schedule = {
      id: Math.max(0, ...db.schedules.map((s) => s.id)) + 1,
      ...fillMonth(periodStart, t),
      status: 'DRAFT',
      source: 'TEMPLATE',
      policy: { weeklyHolidayPay: 'ALLOW', priority: 'FAIRNESS' },
      aiComment: `템플릿 "${t.name}"을 적용했습니다.`,
      updatedAt: new Date().toISOString(),
    };
    db.schedules = db.schedules.filter((s) => s.periodStart !== periodStart || s.status === 'CONFIRMED');
    db.schedules.push(schedule);
    persist();
    return delay(schedule);
  },
};
