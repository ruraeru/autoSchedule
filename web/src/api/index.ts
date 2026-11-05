// REST API (PRD §10). VITE_USE_MOCK=false 이면 Spring Boot 서버(/api)로 요청한다.
import type { GenerateRequest, Schedule, Staff, Store, Template } from '../types';
import { sortParts } from '../lib/rules';
import { mock } from './mock';

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

async function http<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.text()) || `${res.status} ${res.statusText}`);
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  // 파트는 어디서나 시작 시각 순으로 쓴다(mock은 저장할 때 이미 정렬)
  getStore: (): Promise<Store> => (USE_MOCK ? mock.getStore() : http<Store>('GET', '/stores/me').then((s) => ({ ...s, parts: sortParts(s.parts) }))),
  updateStore: (s: Store): Promise<Store> => (USE_MOCK ? mock.updateStore(s) : http('PUT', '/stores/me', s)),

  listStaff: (): Promise<Staff[]> => (USE_MOCK ? mock.listStaff() : http('GET', '/staff')),
  saveStaff: (s: Staff): Promise<Staff> =>
    USE_MOCK ? mock.saveStaff(s) : s.id ? http('PUT', `/staff/${s.id}`, s) : http('POST', '/staff', s),
  deleteStaff: (id: number): Promise<null> => (USE_MOCK ? mock.deleteStaff(id) : http('DELETE', `/staff/${id}`)),

  listSchedules: (): Promise<Schedule[]> => (USE_MOCK ? mock.listSchedules() : http('GET', '/schedules')),
  getSchedule: (id: number): Promise<Schedule> => (USE_MOCK ? mock.getSchedule(id) : http('GET', `/schedules/${id}`)),
  saveSchedule: (id: number, body: Pick<Schedule, 'shifts' | 'leaves'>): Promise<Schedule> =>
    USE_MOCK ? mock.saveSchedule(id, body) : http('PUT', `/schedules/${id}/shifts`, body),
  confirmSchedule: (id: number): Promise<Schedule> =>
    USE_MOCK ? mock.confirmSchedule(id) : http('POST', `/schedules/${id}/confirm`),
  createSchedule: (periodStart: string, prefillFixed: boolean): Promise<Schedule> =>
    USE_MOCK ? mock.createSchedule(periodStart, prefillFixed) : http('POST', '/schedules', { periodStart, prefillFixed }),
  deleteSchedule: (id: number): Promise<null> => (USE_MOCK ? mock.deleteSchedule(id) : http('DELETE', `/schedules/${id}`)),
  generateSchedule: (req: GenerateRequest): Promise<Schedule> =>
    USE_MOCK ? mock.generateSchedule(req) : http('POST', '/schedules/generate', req),

  listTemplates: (): Promise<Template[]> => (USE_MOCK ? mock.listTemplates() : http('GET', '/templates')),
  saveTemplate: (name: string, scheduleId: number): Promise<Template> =>
    USE_MOCK ? mock.saveTemplate(name, scheduleId) : http('POST', '/templates', { name, scheduleId }),
  deleteTemplate: (id: number): Promise<null> => (USE_MOCK ? mock.deleteTemplate(id) : http('DELETE', `/templates/${id}`)),
  applyTemplate: (id: number, periodStart: string): Promise<Schedule> =>
    USE_MOCK ? mock.applyTemplate(id, periodStart) : http('POST', `/templates/${id}/apply`, { periodStart }),
};

