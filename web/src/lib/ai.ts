// Gemini 근무표 생성: 프롬프트 만들기(서버)와 응답 검증(브라우저)
import type { GenerateRequest, Shift, Staff, Store } from '../types';
import { canWork, hoursOn, withTimes } from './rules';
import { datesBetween, dayIndex, DAY_LABELS, fromMin, isWeekendOrHoliday, monthEnd, snap, toMin } from './time';

export interface AiInput {
  store: Store;
  staff: Staff[];
  req: GenerateRequest;
}

export interface AiShift {
  staffId: number;
  date: string;
  start: string;
  end: string;
  partId: string | null;
}

export interface AiOutput {
  shifts: AiShift[];
  comment: string;
}

/** Gemini responseSchema (OpenAPI 부분집합) */
export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    shifts: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          staffId: { type: 'INTEGER' },
          date: { type: 'STRING', description: 'YYYY-MM-DD' },
          start: { type: 'STRING', description: 'HH:MM, 15분 단위' },
          end: { type: 'STRING', description: 'HH:MM, 15분 단위' },
          partId: { type: 'STRING', nullable: true },
        },
        required: ['staffId', 'date', 'start', 'end', 'partId'],
      },
    },
    comment: { type: 'STRING', description: '사장님께 드리는 2~3문장 배치 요약' },
  },
  required: ['shifts', 'comment'],
};

/** 이름·연락처는 빼고 번호로만 보낸다 */
export function buildPrompt({ store, staff, req }: AiInput): string {
  const dates = datesBetween(req.periodStart, monthEnd(req.periodStart));
  const people = staff.map((s) => {
    const base = `- #${s.id} ${s.employmentType === 'FULL_TIME' ? '직원' : '알바생'}${s.isMinor ? '(연소자)' : ''}`;
    const hours =
      s.employmentType === 'FULL_TIME'
        ? `계약 주 ${s.contractWeeklyHours ?? 40}시간`
        : `희망 주 ${s.preferredWeeklyHours?.join('–') ?? '자유'}시간`;
    if (s.employmentType === 'FULL_TIME')
      return `${base}, ${hours}, ${s.workHours ? `고정 근무(요일별, 쉼인 요일은 근무 없음): ${DAY_LABELS.map((d, i) => `${d} ${s.workHours![i] ? `${s.workHours![i]!.start}–${s.workHours![i]!.end}` : '쉼'}`).join(' / ')}` : '영업시간 안이면 언제나 근무 가능'}`;
    const avail = DAY_LABELS.map((d, i) => `${d} ${(s.availableParts[i] ?? []).map((id) => `"${id}"`).join('·') || '불가'}`).join(' / ');
    return `${base}, ${hours}, 근무 가능 파트(partId): ${avail}`;
  });
  const days = dates.map((d) => {
    const h = hoursOn(store, d);
    const holiday = isWeekendOrHoliday(d) && dayIndex(d) < 5;
    return `${d} (${DAY_LABELS[dayIndex(d)]}${holiday ? ', 공휴일' : ''}) ${h.open}–${h.close}`;
  });
  const demand = store.demand.map((d) => `${d.start}–${d.end} ${d.required}명${d.days ? ` (${d.days.map((x) => DAY_LABELS[x]).join('·')}요일만)` : ''}`);

  return `당신은 한국 매장의 한 달 근무표를 짜는 도우미입니다. 아래 조건으로 ${req.periodStart.slice(0, 7)} 한 달 근무표를 JSON으로 만드세요.

## 영업일과 영업시간
${days.join('\n')}

## 알바생 근무 파트 (알바생은 파트 단위로만 근무)
${store.parts.map((p) => `- partId "${p.id}" ${p.name} ${p.start}–${p.end}`).join('\n')}

## 시간대별 필요 인원 (휴게 중인 사람은 빼고 셈)
${demand.join('\n') || '- 지정 없음'}

## 구성원 (#번호 = staffId)
${people.join('\n')}

## 규칙
1. 알바생은 partId에 파트 id를 넣고 start/end는 그 파트 시각과 똑같이 한다.
2. 직원은 partId를 null로 한다. 고정 근무가 있으면 근무 요일마다 start/end를 그 요일 시각과 똑같이 넣는다. 없으면 출퇴근 시각을 15분 단위로 정해 인력이 부족한 시간대를 메운다.
3. 근무는 그날 영업시간 안에서만 한다. 알바생은 그 요일의 근무 가능 파트에만 배치한다. 한 사람은 하루에 한 번만 근무한다.
4. 연소자는 하루 7시간, 주 35시간 이하이고 22시 이후 근무 불가.
5. 주(월~일) 근로시간은 40시간 이하, 연장 포함 52시간 이하.
${req.fillContractHours ? '6. 직원은 매주 계약 근로시간을 먼저 채운다.' : '6. 직원 근무시간은 필요한 만큼만 배치한다.'}
7. ${req.weeklyHolidayPay === 'MINIMIZE' ? '알바생은 가능하면 주 15시간 미만으로 배치해 주휴수당이 생기지 않게 한다.' : '알바생은 희망 주간 근무시간을 우선한다.'}
8. ${req.priority === 'FAIRNESS' ? '알바생끼리 근무시간 차이를 줄인다.' : '필요 인원만큼만 최소로 배치해 인건비를 줄인다.'}
9. 휴게시간은 시스템이 자동으로 넣으니 출근~퇴근 시각만 주면 된다.

comment에는 배치 방식을 사장님께 2~3문장으로 요약한다. 구성원은 #번호로만 부른다.`;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;

/** AI 응답을 믿지 않고 걸러 근무로 만든다. 규칙에 안 맞는 줄은 버린다 */
export function toShifts(out: AiOutput, { store, staff, req }: AiInput, uid: () => string): Shift[] {
  const dates = new Set(datesBetween(req.periodStart, monthEnd(req.periodStart)));
  const seen = new Set<string>();
  const shifts: Shift[] = [];
  for (const a of Array.isArray(out?.shifts) ? out.shifts : []) {
    const person = staff.find((s) => s.id === a.staffId);
    if (!person || !dates.has(a.date) || seen.has(`${a.staffId}|${a.date}`)) continue;
    const base: Shift = { id: uid(), staffId: person.id, date: a.date, start: '', end: '', partId: null, breakStart: null, breakMinutes: 0, tentative: false };
    let start: string;
    let end: string;
    if (person.employmentType === 'PART_TIME') {
      const part = store.parts.find((p) => p.id === a.partId);
      if (!part) continue;
      [start, end, base.partId] = [part.start, part.end, part.id];
    } else if (person.workHours) {
      const w = person.workHours[dayIndex(a.date)];
      if (!w) continue;
      [start, end] = [w.start, w.end];
    } else {
      if (!HHMM.test(a.start) || !HHMM.test(a.end)) continue;
      [start, end] = [fromMin(snap(toMin(a.start))), fromMin(snap(toMin(a.end)))];
    }
    const h = hoursOn(store, a.date);
    if (toMin(start) >= toMin(end) || toMin(start) < toMin(h.open) || toMin(end) > toMin(h.close)) continue;
    if (!canWork(person, store, { date: a.date, start, end, partId: base.partId })) continue;
    seen.add(`${a.staffId}|${a.date}`);
    shifts.push(withTimes(base, start, end));
  }
  return shifts;
}
