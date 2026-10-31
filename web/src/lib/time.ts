export const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

export const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

const pad = (n: number) => String(n).padStart(2, '0');

export const fromMin = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

export const snap = (m: number, step = 15) => Math.round(m / step) * step;

export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const parse = (date: string) => new Date(`${date}T00:00:00`);

export const addDays = (date: string, n: number) => {
  const d = parse(date);
  d.setDate(d.getDate() + n);
  return ymd(d);
};

/** 0=월 ... 6=일 */
export const dayIndex = (date: string) => (parse(date).getDay() + 6) % 7;

export const mondayOf = (date: string) => addDays(date, -dayIndex(date));

export const weekDates = (start: string) => Array.from({ length: 7 }, (_, i) => addDays(start, i));

export const diffDays = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);

/** "11/6" */
export const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;

/** "금 11/6" */
export const dayLabel = (date: string) => `${DAY_LABELS[dayIndex(date)]} ${md(date)}`;

/** "11월 1주차" — 해당 주 월요일 기준 */
export const weekLabel = (start: string) => {
  const d = parse(start);
  return `${d.getMonth() + 1}월 ${Math.ceil(d.getDate() / 7)}주차`;
};

/** 분 → "13.5h" */
export const hours = (min: number) => `${Math.round((min / 60) * 10) / 10}h`;

export const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;

/** "12–21시" 또는 "10:30–19:30" */
export const shortRange = (start: string, end: string) =>
  start.endsWith(':00') && end.endsWith(':00') ? `${Number(start.slice(0, 2))}–${Number(end.slice(0, 2))}시` : `${start}–${end}`;
