import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { keys, useStaff, useStore } from '../api/queries';
import PageHeader from '../components/PageHeader';
import { Avatar, Badge, Button, Card, cx, Field, inputClass, Loading, Segmented } from '../components/ui';
import { hoursSpan } from '../lib/rules';
import { DAY_LABELS } from '../lib/time';
import type { EmploymentType, Staff } from '../types';

type Filter = 'ALL' | EmploymentType;

const blank = (type: EmploymentType, open: number, close: number): Staff => ({
  id: 0,
  name: '',
  employmentType: type,
  title: type === 'FULL_TIME' ? '정직원' : '알바',
  hourlyWage: 10320,
  isMinor: false,
  contractWeeklyHours: type === 'FULL_TIME' ? 40 : null,
  preferredWeeklyHours: type === 'PART_TIME' ? [8, 15] : null,
  availability: Array.from({ length: 7 }, () => Array.from({ length: close - open }, (_, i) => open + i)),
  phone: '',
});

export default function StaffPage() {
  const { data: staff } = useStaff();
  const { data: store } = useStore();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [editing, setEditing] = useState<Staff | null>(null);

  if (!staff || !store) return <Loading />;
  const span = hoursSpan(store);
  const open = Math.floor(span.open / 60);
  const close = Math.ceil(span.close / 60);
  const list = staff.filter((s) => filter === 'ALL' || s.employmentType === filter);
  const count = (t: EmploymentType) => staff.filter((s) => s.employmentType === t).length;

  return (
    <div>
      <PageHeader
        title="직원·알바생 관리"
        sub="직원은 계약 주 근로시간 안에서 출근 시간을 유동 배치하고, 알바생은 파트 단위로 배치합니다."
        actions={
          <Button variant="primary" onClick={() => setEditing(blank(filter === 'FULL_TIME' ? 'FULL_TIME' : 'PART_TIME', open, close))}>
            + 구성원 추가
          </Button>
        }
      />
      <div className="mb-4">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'ALL', label: `전체 ${staff.length}` },
            { value: 'FULL_TIME', label: `직원 ${count('FULL_TIME')}` },
            { value: 'PART_TIME', label: `알바생 ${count('PART_TIME')}` },
          ]}
        />
      </div>

      <div className={cx('grid items-start gap-4', editing && 'xl:grid-cols-[1fr_420px]')}>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line bg-bg/60 text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">이름</th>
                <th className="px-4 py-3 font-medium">고용 형태</th>
                <th className="px-4 py-3 font-medium">시급</th>
                <th className="px-4 py-3 font-medium">주 근로시간</th>
                <th className="px-4 py-3 font-medium">연락처</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((s) => (
                <tr key={s.id} onClick={() => setEditing(structuredClone(s))} className={cx('cursor-pointer hover:bg-bg', editing?.id === s.id && 'bg-brand-subtle/50')}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={s.name} fullTime={s.employmentType === 'FULL_TIME'} />
                      <span className="font-medium">{s.name}</span>
                      {s.isMinor && <Badge tone="warning">연소자</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={s.employmentType === 'FULL_TIME' ? 'staff' : 'brand'}>
                      {s.employmentType === 'FULL_TIME' ? `직원 · ${s.title}` : '알바 · 파트 근무'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">{s.hourlyWage.toLocaleString()}원</td>
                  <td className="px-4 py-3">
                    {s.employmentType === 'FULL_TIME' ? `계약 ${s.contractWeeklyHours}h` : `희망 ${s.preferredWeeklyHours?.join('–')}h`}
                  </td>
                  <td className="px-4 py-3 text-muted">{s.phone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        {editing && <StaffForm key={editing.id || 'new'} initial={editing} open={open} close={close} minWage={store.minimumWage} onClose={() => setEditing(null)} />}
      </div>
    </div>
  );
}

function StaffForm({ initial, open, close, minWage, onClose }: { initial: Staff; open: number; close: number; minWage: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [s, setS] = useState(initial);
  const set = (p: Partial<Staff>) => setS((x) => ({ ...x, ...p }));
  const done = () => {
    qc.invalidateQueries({ queryKey: keys.staff });
    qc.invalidateQueries({ queryKey: keys.schedules });
    onClose();
  };
  const save = useMutation({ mutationFn: () => api.saveStaff(s), onSuccess: done });
  const remove = useMutation({ mutationFn: () => api.deleteStaff(s.id), onSuccess: done });
  const full = s.employmentType === 'FULL_TIME';
  const hoursList = Array.from({ length: close - open }, (_, i) => open + i);

  const setType = (t: EmploymentType) =>
    set({
      employmentType: t,
      title: t === 'FULL_TIME' ? '정직원' : s.isMinor ? '연소자' : '알바',
      contractWeeklyHours: t === 'FULL_TIME' ? (s.contractWeeklyHours ?? 40) : null,
      preferredWeeklyHours: t === 'PART_TIME' ? (s.preferredWeeklyHours ?? [8, 15]) : null,
      isMinor: t === 'FULL_TIME' ? false : s.isMinor,
    });
  const toggle = (d: number, h: number) =>
    set({ availability: s.availability.map((row, i) => (i !== d ? row : row.includes(h) ? row.filter((x) => x !== h) : [...row, h].sort((a, b) => a - b))) });
  const toggleDay = (d: number) => set({ availability: s.availability.map((row, i) => (i !== d ? row : row.length ? [] : hoursList)) });

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">{s.id ? `${initial.name} 정보` : '구성원 추가'}</h2>
        <button onClick={onClose} className="text-muted hover:text-ink" aria-label="닫기">
          ✕
        </button>
      </div>
      <Segmented<EmploymentType>
        value={s.employmentType}
        onChange={setType}
        options={[
          { value: 'PART_TIME', label: '알바생 (파트 근무)' },
          { value: 'FULL_TIME', label: '직원 (유동 근무)' },
        ]}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="이름">
          <input className={inputClass} value={s.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label={full ? '직함' : '연락처'}>
          {full ? (
            <input className={inputClass} value={s.title} onChange={(e) => set({ title: e.target.value })} placeholder="매니저, 정직원…" />
          ) : (
            <input className={inputClass} value={s.phone} onChange={(e) => set({ phone: e.target.value })} />
          )}
        </Field>
        <Field label={full ? '통상시급' : '시급'} hint={s.hourlyWage < minWage ? `최저임금 ${minWage.toLocaleString()}원 미만` : undefined}>
          <input type="number" className={inputClass} value={s.hourlyWage} step={10} onChange={(e) => set({ hourlyWage: Number(e.target.value) })} />
        </Field>
        {full ? (
          <Field label="계약 주 근로시간" hint="연장근로는 주 12시간까지">
            <input type="number" className={inputClass} value={s.contractWeeklyHours ?? 40} min={1} max={52} onChange={(e) => set({ contractWeeklyHours: Number(e.target.value) })} />
          </Field>
        ) : (
          <Field label="희망 주간 근무시간">
            <div className="flex items-center gap-1.5">
              {[0, 1].map((i) => (
                <input
                  key={i}
                  type="number"
                  className={inputClass}
                  value={s.preferredWeeklyHours?.[i] ?? 0}
                  onChange={(e) => {
                    const p: [number, number] = [...(s.preferredWeeklyHours ?? [0, 0])] as [number, number];
                    p[i] = Number(e.target.value);
                    set({ preferredWeeklyHours: p });
                  }}
                />
              ))}
            </div>
          </Field>
        )}
      </div>
      {full && (
        <Field label="연락처">
          <input className={inputClass} value={s.phone} onChange={(e) => set({ phone: e.target.value })} />
        </Field>
      )}
      {!full && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-brand" checked={s.isMinor} onChange={(e) => set({ isMinor: e.target.checked, title: e.target.checked ? '연소자' : '알바' })} />
          연소근로자 (만 18세 미만 · 1일 7시간, 22시 이후 근무 불가)
        </label>
      )}

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-[13px] font-medium">근무 가능 시간</span>
          <span className="text-[11px] text-muted">{full ? '출근 가능한 범위 — 이 안에서 날마다 시간이 정해짐' : '칸을 눌러 가능/불가 전환'}</span>
        </div>
        <div className="overflow-x-auto">
          <div className="inline-grid gap-0.5" style={{ gridTemplateColumns: `28px repeat(${hoursList.length}, 20px)` }}>
            <span />
            {hoursList.map((h) => (
              <span key={h} className="text-center text-[10px] text-muted">
                {h % 2 === 0 ? h : ''}
              </span>
            ))}
            {DAY_LABELS.map((d, di) => (
              <div key={d} className="contents">
                <button onClick={() => toggleDay(di)} className="text-left text-xs text-muted hover:text-ink">
                  {d}
                </button>
                {hoursList.map((h) => (
                  <button
                    key={h}
                    onClick={() => toggle(di, h)}
                    aria-label={`${d} ${h}시`}
                    className={cx('h-5 rounded-sm', s.availability[di]?.includes(h) ? (full ? 'bg-staff/70' : 'bg-brand/70') : 'bg-bg hover:bg-line')}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {(save.error || remove.error) && <p className="text-sm text-danger">{(save.error ?? remove.error)!.message}</p>}
      <div className="flex gap-2 pt-1">
        {s.id > 0 && (
          <Button variant="danger" onClick={() => window.confirm(`${initial.name}님을 삭제할까요? 근무표의 배치도 함께 삭제됩니다.`) && remove.mutate()}>
            삭제
          </Button>
        )}
        <Button variant="primary" className="ml-auto" disabled={!s.name.trim() || save.isPending} onClick={() => save.mutate()}>
          저장
        </Button>
      </div>
    </Card>
  );
}
