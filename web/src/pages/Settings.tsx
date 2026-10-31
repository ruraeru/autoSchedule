import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Fragment, useEffect, useState } from 'react';
import { api } from '../api';
import { keys, useStore } from '../api/queries';
import PageHeader from '../components/PageHeader';
import { Button, Card, cx, inputBase, Loading } from '../components/ui';
import { hoursSpan, minBreakFor } from '../lib/rules';
import { fromMin, toMin } from '../lib/time';
import type { Part, PartTone, Store } from '../types';

const toneBar: Record<string, string> = { open: 'bg-open', middle: 'bg-middle', close: 'bg-close', staff: 'bg-staff' };
// 15분 단위 24시간제. 기본 time 입력은 한국어 환경에서 "오전 08:00"으로 넓게 나와서 select를 쓴다
const TIMES = Array.from({ length: 24 * 4 + 1 }, (_, i) => fromMin(i * 15));

function TimeRange({ label, start, end, onChange }: { label: string; start: string; end: string; onChange: (start: string, end: string) => void }) {
  const sel = 'cursor-pointer appearance-none rounded-md bg-transparent px-1.5 py-1 outline-none hover:bg-bg focus-visible:bg-brand-subtle';
  return (
    <span className="inline-flex h-9 shrink-0 items-center rounded-lg border border-line bg-surface px-1 text-[13px] tabular-nums">
      <select aria-label={`${label} 시작`} className={sel} value={start} onChange={(e) => onChange(e.target.value, end)}>
        {TIMES.map((t) => (
          <option key={t}>{t}</option>
        ))}
      </select>
      <span className="text-muted">–</span>
      <select aria-label={`${label} 종료`} className={sel} value={end} onChange={(e) => onChange(start, e.target.value)}>
        {TIMES.map((t) => (
          <option key={t}>{t}</option>
        ))}
      </select>
    </span>
  );
}
// 새 파트 색은 세 가지를 돌려 쓴다
const TONES: PartTone[] = ['open', 'middle', 'close'];

/** 저장 막는 이유. 없으면 null */
export function storeError(s: Store): string | null {
  if (toMin(s.open) >= toMin(s.close)) return '평일 영업 종료 시각은 시작 시각보다 늦어야 합니다.';
  if (toMin(s.weekendOpen) >= toMin(s.weekendClose)) return '주말·공휴일 영업 종료 시각은 시작 시각보다 늦어야 합니다.';
  const span = hoursSpan(s);
  for (const p of s.parts) {
    if (!p.name.trim()) return '파트 이름을 입력하세요.';
    if (toMin(p.start) >= toMin(p.end)) return `${p.name} 종료 시각은 시작 시각보다 늦어야 합니다.`;
    if (toMin(p.start) < span.open || toMin(p.end) > span.close) return `${p.name} 시간은 영업시간 안이어야 합니다.`;
  }
  return null;
}

export default function Settings() {
  const { data: store } = useStore();
  const qc = useQueryClient();
  const [form, setForm] = useState<Store | null>(null);
  useEffect(() => setForm(store ?? null), [store]);

  const save = useMutation({
    mutationFn: (s: Store) => api.updateStore(s),
    onSuccess: (s) => {
      qc.setQueryData(keys.store, s);
      // 지운 파트는 구성원·근무표에서도 정리되므로 다시 불러온다
      qc.invalidateQueries({ queryKey: keys.staff });
      qc.invalidateQueries({ queryKey: keys.schedules });
      qc.invalidateQueries({ queryKey: keys.templates });
    },
  });

  if (!store || !form) return <Loading />;
  const set = (p: Partial<Store>) => setForm({ ...form, ...p });
  const setPart = (id: string, p: Partial<Part>) =>
    set({
      parts: form.parts.map((x) => {
        if (x.id !== id) return x;
        const next = { ...x, ...p };
        // 법정 최소 휴게는 파트 길이로 정해진다
        return { ...next, breakMinutes: toMin(next.end) > toMin(next.start) ? minBreakFor(toMin(next.end) - toMin(next.start)) : 0 };
      }),
    });
  const addPart = () => {
    const last = form.parts[form.parts.length - 1];
    const start = last && toMin(last.end) < toMin(form.close) ? last.end : form.open;
    const end = fromMin(Math.min(toMin(start) + 4 * 60, toMin(form.close)));
    const tone = TONES[form.parts.length % TONES.length];
    set({ parts: [...form.parts, { id: crypto.randomUUID(), name: '새 파트', tone, start, end, breakMinutes: minBreakFor(toMin(end) - toMin(start)) }] });
  };
  const removePart = (p: Part) => {
    if (store.parts.some((x) => x.id === p.id) && !window.confirm(`${p.name} 파트를 지울까요? 저장하면 이 파트로 잡힌 근무는 파트 없는 근무로 바뀌고, 구성원의 근무 가능 파트에서도 빠집니다.`)) return;
    set({ parts: form.parts.filter((x) => x.id !== p.id) });
  };
  const error = storeError(form);
  const dirty = JSON.stringify(form) !== JSON.stringify(store);

  return (
    <div className="space-y-4">
      <PageHeader title="매장 설정" sub={[store.name, store.branch].filter(Boolean).join(' ')} />
      <Card className="min-w-0 p-5">
        <h2 className="font-bold">기본 정보</h2>
        <dl className="mt-3 grid grid-cols-1 items-center gap-x-4 gap-y-2 text-sm sm:grid-cols-[160px_1fr]">
          {(
            [
              ['평일', 'open', 'close'],
              ['주말·공휴일', 'weekendOpen', 'weekendClose'],
            ] as const
          ).map(([label, o, c]) => (
            <Fragment key={label}>
              <dt className="text-muted">영업시간 · {label}</dt>
              <dd className="mb-1 sm:mb-0">
                <TimeRange label={`${label} 영업`} start={form[o]} end={form[c]} onChange={(a, b) => set({ [o]: a, [c]: b })} />
              </dd>
            </Fragment>
          ))}
          <dt className="text-muted">사업장 규모</dt>
          <dd>{store.size === 'OVER_5' ? '5인 이상 (연장·야간 가산, 주 52시간 적용)' : '5인 미만'}</dd>
          <dt className="text-muted">최저시급</dt>
          <dd>{store.minimumWage.toLocaleString()}원 (2026년)</dd>
        </dl>
      </Card>
      <Card className="min-w-0 p-5">
        <h2 className="font-bold">알바생 근무 파트</h2>
        {form.parts.length > 0 && (
          // 파트 한 줄: 색 · 이름 · 근무 시간 · 휴게 · 삭제 를 같은 열에 맞춰 가로로
          <div className="mt-3 grid grid-cols-[minmax(0,14rem)_auto_auto_auto] gap-x-4 text-sm sm:grid-cols-[minmax(0,16rem)_auto_4.5rem_1fr]">
            <span className="pb-1.5 pl-3 text-xs text-muted">파트 이름</span>
            <span className="pb-1.5 pl-1 text-xs text-muted">근무 시간</span>
            <span className="pb-1.5 text-xs text-muted">휴게</span>
            <span />
            {form.parts.map((p) => (
              <div key={p.id} className="contents">
                <span className="flex min-w-0 items-center gap-2 border-t border-line py-2">
                  <span className={cx('h-7 w-1 shrink-0 rounded-full', toneBar[p.tone])} />
                  <input aria-label="파트 이름" className={cx(inputBase, 'h-9 w-full min-w-0 px-2.5 text-[13px]')} value={p.name} onChange={(e) => setPart(p.id, { name: e.target.value })} />
                </span>
                <span className="flex items-center border-t border-line py-2">
                  <TimeRange label={p.name} start={p.start} end={p.end} onChange={(start, end) => setPart(p.id, { start, end })} />
                </span>
                <span className="flex items-center border-t border-line py-2 whitespace-nowrap text-muted">{p.breakMinutes}분</span>
                <span className="flex items-center justify-end border-t border-line py-2">
                  <Button size="sm" variant="ghost" onClick={() => removePart(p)} aria-label={`${p.name} 삭제`}>
                    삭제
                  </Button>
                </span>
              </div>
            ))}
          </div>
        )}
        {!form.parts.length && <p className="mt-3 text-sm text-muted">등록된 파트가 없습니다. 알바생은 파트가 있어야 배치됩니다.</p>}
        <Button size="sm" className="mt-3" onClick={addPart}>
          + 파트 추가
        </Button>
        <p className="mt-3 text-xs text-muted">휴게시간은 파트 길이에 맞춰 법정 최소로 정해집니다. 직원은 파트 없이 출퇴근 시각을 날마다 지정합니다.</p>
      </Card>
      {(error || save.error) && <p className="text-sm text-danger">{error ?? save.error!.message}</p>}
      <div className="flex justify-end gap-2">
        <Button onClick={() => setForm(store)} disabled={!dirty || save.isPending}>
          되돌리기
        </Button>
        <Button variant="primary" onClick={() => save.mutate(form)} disabled={!dirty || !!error || save.isPending}>
          {save.isPending ? '저장 중…' : '저장'}
        </Button>
      </div>
    </div>
  );
}
