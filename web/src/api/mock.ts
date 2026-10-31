// 백엔드 없이 동작하는 메모리 DB. localStorage에 보관해 새로고침해도 유지한다.
import { addDays, diffDays, dayIndex } from '../lib/time';
import type { GenerateRequest, Schedule, Shift, Staff, Store, Template } from '../types';
import { seedSchedule, seedStaff, seedStore, SEED_WEEK } from './seed';

const KEY = 'autoschedule-mock-v1';

interface Db {
  store: Store;
  staff: Staff[];
  schedules: Schedule[];
  templates: Template[];
}

const fresh = (): Db => structuredClone({ store: seedStore, staff: seedStaff, schedules: [seedSchedule], templates: [] });

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
const uid = () => crypto.randomUUID();

export const mock = {
  reset() {
    db = fresh();
    persist();
  },

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

  /** 서버에서는 Gemini 생성 + 규칙 검증 루프. 목업은 시드 근무표를 요청 주로 옮겨 돌려준다. */
  generateSchedule(req: GenerateRequest) {
    const shift = diffDays(SEED_WEEK, req.periodStart);
    const base = structuredClone(seedSchedule);
    const schedule: Schedule = {
      ...base,
      id: Math.max(0, ...db.schedules.map((s) => s.id)) + 1,
      periodStart: req.periodStart,
      periodEnd: addDays(req.periodStart, 6),
      policy: { weeklyHolidayPay: req.weeklyHolidayPay, priority: req.priority },
      shifts: base.shifts.map((s) => ({ ...s, id: uid(), date: addDays(s.date, shift) })),
      leaves: base.leaves.map((l) => ({ ...l, id: uid(), date: addDays(l.date, shift) })),
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
    const strip = <T extends { id: string; date: string }>({ id: _id, date, ...rest }: T) => ({ ...rest, dayIndex: dayIndex(date) });
    const t: Template = {
      id: Math.max(0, ...db.templates.map((x) => x.id)) + 1,
      name,
      createdAt: new Date().toISOString(),
      shifts: s.shifts.map(strip) as Template['shifts'],
      leaves: s.leaves.map(strip) as Template['leaves'],
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
      periodStart,
      periodEnd: addDays(periodStart, 6),
      status: 'DRAFT',
      source: 'TEMPLATE',
      policy: { weeklyHolidayPay: 'ALLOW', priority: 'FAIRNESS' },
      shifts: t.shifts.map(({ dayIndex: d, ...rest }): Shift => ({ ...rest, id: uid(), date: addDays(periodStart, d) })),
      leaves: t.leaves.map(({ dayIndex: d, ...rest }) => ({ ...rest, id: uid(), date: addDays(periodStart, d) })),
      aiComment: `템플릿 "${t.name}"을 적용했습니다.`,
      updatedAt: new Date().toISOString(),
    };
    db.schedules = db.schedules.filter((s) => s.periodStart !== periodStart || s.status === 'CONFIRMED');
    db.schedules.push(schedule);
    persist();
    return delay(schedule);
  },
};
