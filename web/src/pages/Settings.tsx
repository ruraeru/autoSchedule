import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Fragment, useEffect, useState } from 'react';
import { api } from '../api';
import { keys, useStore } from '../api/queries';
import PageHeader from '../components/PageHeader';
import { Button, Card, cx, inputClass, Loading } from '../components/ui';
import { hoursSpan, minBreakFor } from '../lib/rules';
import { toMin } from '../lib/time';
import type { Part, Store } from '../types';

const toneBar: Record<string, string> = { open: 'bg-open', middle: 'bg-middle', close: 'bg-close', staff: 'bg-staff' };
const timeInput = cx(inputClass, 'w-28');

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
    onSuccess: (s) => qc.setQueryData(keys.store, s),
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
  const error = storeError(form);
  const dirty = JSON.stringify(form) !== JSON.stringify(store);

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title="매장 설정" sub={`${store.name} ${store.branch}`} />
      <Card className="p-5">
        <h2 className="font-bold">기본 정보</h2>
        <dl className="mt-3 grid grid-cols-[160px_1fr] items-center gap-y-2 text-sm">
          {(
            [
              ['평일', 'open', 'close'],
              ['주말·공휴일', 'weekendOpen', 'weekendClose'],
            ] as const
          ).map(([label, o, c]) => (
            <Fragment key={label}>
              <dt className="text-muted">영업시간 · {label}</dt>
              <dd className="flex items-center gap-2">
                <input type="time" step={900} aria-label={`${label} 영업 시작`} className={timeInput} value={form[o]} onChange={(e) => set({ [o]: e.target.value })} />
                –
                <input type="time" step={900} aria-label={`${label} 영업 종료`} className={timeInput} value={form[c]} onChange={(e) => set({ [c]: e.target.value })} />
              </dd>
            </Fragment>
          ))}
          <dt className="text-muted">사업장 규모</dt>
          <dd>{store.size === 'OVER_5' ? '5인 이상 (연장·야간 가산, 주 52시간 적용)' : '5인 미만'}</dd>
          <dt className="text-muted">최저시급</dt>
          <dd>{store.minimumWage.toLocaleString()}원 (2026년)</dd>
        </dl>
      </Card>
      <Card className="p-5">
        <h2 className="font-bold">알바생 근무 파트</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {form.parts.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <span className={cx('h-8 w-1 rounded-full', toneBar[p.tone])} />
              <input aria-label="파트 이름" className={cx(inputClass, 'w-24')} value={p.name} onChange={(e) => setPart(p.id, { name: e.target.value })} />
              <input type="time" step={900} aria-label={`${p.name} 시작`} className={timeInput} value={p.start} onChange={(e) => setPart(p.id, { start: e.target.value })} />
              –
              <input type="time" step={900} aria-label={`${p.name} 종료`} className={timeInput} value={p.end} onChange={(e) => setPart(p.id, { end: e.target.value })} />
              <span className="ml-1 text-muted">휴게 {p.breakMinutes}분</span>
            </li>
          ))}
        </ul>
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
