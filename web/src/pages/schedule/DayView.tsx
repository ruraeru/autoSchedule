// 일간 타임라인: 출퇴근·휴게를 15분 단위로 드래그, 휴게 조정 제안
import { useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { blockKind } from '../../components/shiftDisplay';
import { Avatar, Badge, Button, Card, cx } from '../../components/ui';
import { breakRange, placeBreak, requiredBreak, withTimes, workMin, type Validation } from '../../lib/rules';
import { suggestBreakMoves } from '../../lib/suggest';
import { dayIndex, DAY_LABELS, fromMin, hours, md, snap, toMin } from '../../lib/time';
import { useEditor } from '../../store/editor';
import type { Schedule, Shift, Staff, Store } from '../../types';
import type { DialogTarget } from './ShiftDialog';

interface Props {
  schedule: Schedule;
  staff: Staff[];
  store: Store;
  v: Validation;
  dates: string[];
  date: string;
  onDate: (d: string) => void;
  onOpen: (t: DialogTarget) => void;
}

type DragMode = 'start' | 'end' | 'move' | 'break';
interface Drag {
  mode: DragMode;
  x: number;
  width: number;
  orig: Shift;
}

const MIN_SHIFT = 60;

const barClass: Record<string, string> = {
  open: 'bg-open-bg border-open text-open',
  middle: 'bg-middle-bg border-middle text-middle',
  close: 'bg-close-bg border-close text-close',
  staff: 'bg-staff-bg border-staff text-staff',
  tentative: 'bg-surface border-staff border-dashed text-staff',
  error: 'bg-danger-subtle border-danger text-danger',
  leave: 'bg-bg border-line text-muted',
};

export default function DayView({ schedule, staff, store, v, dates, date, onDate, onOpen }: Props) {
  const edit = useEditor((s) => s.edit);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [preview, setPreview] = useState<Shift | null>(null);

  const from = toMin(store.open) - 60;
  const to = toMin(store.close) + 60;
  const span = to - from;
  const pct = (m: number) => `${((m - from) / span) * 100}%`;

  const dayShifts = schedule.shifts.filter((s) => s.date === date).map((s) => (preview?.id === s.id ? preview : s));
  const suggestion = useMemo(() => suggestBreakMoves(store, date, schedule.shifts.filter((s) => s.date === date)), [store, date, schedule.shifts]);
  const [ghost, setGhost] = useState(true);

  const people = staff
    .filter((p) => dayShifts.some((s) => s.staffId === p.id) || schedule.leaves.some((l) => l.staffId === p.id && l.date === date))
    .sort((a, b) => (a.employmentType === b.employmentType ? 0 : a.employmentType === 'FULL_TIME' ? -1 : 1));

  const begin = (e: ReactPointerEvent, mode: DragMode, s: Shift) => {
    e.stopPropagation();
    const track = (e.currentTarget as HTMLElement).closest('[data-track]') as HTMLElement;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ mode, x: e.clientX, width: track.getBoundingClientRect().width, orig: s });
  };
  const move = (e: ReactPointerEvent) => {
    if (!drag) return;
    const d = snap(((e.clientX - drag.x) / drag.width) * span);
    const o = drag.orig;
    const [s0, e0] = [toMin(o.start), toMin(o.end)];
    const clamp = (m: number) => Math.min(Math.max(m, 0), 24 * 60);
    let next = o;
    if (drag.mode === 'start') next = withTimes(o, fromMin(clamp(Math.min(s0 + d, e0 - MIN_SHIFT))), o.end);
    if (drag.mode === 'end') next = withTimes(o, o.start, fromMin(clamp(Math.max(e0 + d, s0 + MIN_SHIFT))));
    if (drag.mode === 'move') {
      const dd = Math.min(Math.max(d, -s0), 24 * 60 - e0);
      next = placeBreak({ ...o, start: fromMin(s0 + dd), end: fromMin(e0 + dd), breakStart: o.breakStart && fromMin(toMin(o.breakStart) + dd) });
    }
    if (drag.mode === 'break' && o.breakStart) next = placeBreak({ ...o, breakStart: fromMin(toMin(o.breakStart) + d) });
    // 시간을 직접 바꾸면 파트 근무가 아니게 된다
    if (drag.mode !== 'break' && (next.start !== o.start || next.end !== o.end)) {
      const part = store.parts.find((p) => p.id === o.partId);
      if (part && (part.start !== next.start || part.end !== next.end)) next = { ...next, partId: null };
    }
    setPreview(next);
  };
  const end = () => {
    if (drag && preview && JSON.stringify(preview) !== JSON.stringify(drag.orig)) {
      const p = preview;
      edit((s) => {
        s.shifts = s.shifts.map((x) => (x.id === p.id ? p : x));
      });
    }
    setDrag(null);
    setPreview(null);
  };

  const applySuggestion = () => {
    if (!suggestion) return;
    edit((s) => {
      for (const m of suggestion.moves) {
        const sh = s.shifts.find((x) => x.id === m.shiftId);
        if (sh) sh.breakStart = m.to;
      }
    });
  };

  const hoursTicks: number[] = [];
  for (let h = from; h <= to; h += 60) hoursTicks.push(h);
  const nameOf = (id: number) => staff.find((s) => s.id === id)?.name ?? '';

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-4">
        <div className="flex gap-1 overflow-x-auto">
          {dates.map((d) => {
            const bad = v.issues.some((i) => i.date === d && (i.severity === 'error' || i.ruleId === 'S-01'));
            return (
              <button
                key={d}
                onClick={() => onDate(d)}
                className={cx(
                  'relative h-9 shrink-0 rounded-lg px-3.5 text-[13px]',
                  d === date ? 'bg-ink font-medium text-white' : 'border border-line bg-surface text-muted hover:text-ink',
                )}
              >
                {DAY_LABELS[dayIndex(d)]} {md(d)}
                {bad && <span className="absolute top-1 right-1 size-1.5 rounded-full bg-danger" />}
              </button>
            );
          })}
        </div>

        <Card className="overflow-x-auto">
          <div className="min-w-[860px]" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
            <div className="grid grid-cols-[168px_1fr] border-b border-line bg-bg/60">
              <div className="px-4 py-2.5 text-xs text-muted">구성원</div>
              <div className="relative h-9">
                {hoursTicks.slice(0, -1).map((h) => (
                  <span key={h} className="absolute top-2.5 -translate-x-1/2 text-[11px] text-muted" style={{ left: pct(h) }}>
                    {h / 60}
                  </span>
                ))}
              </div>
            </div>

            {people.map((p) => {
              const mine = dayShifts.filter((s) => s.staffId === p.id);
              const leave = schedule.leaves.some((l) => l.staffId === p.id && l.date === date);
              const work = mine.reduce((a, s) => a + workMin(s), 0);
              return (
                <div key={p.id} className="grid grid-cols-[168px_1fr] border-b border-line">
                  <div className="flex items-center gap-2 px-4 py-2">
                    <Avatar name={p.name} fullTime={p.employmentType === 'FULL_TIME'} />
                    <div className="min-w-0 leading-tight">
                      <div className="text-sm font-bold">{p.name}</div>
                      <div className="text-[11px] text-muted">
                        {p.employmentType === 'FULL_TIME' ? '직원' : p.isMinor ? '알바 · 연소자' : '알바'} · {leave ? '연차' : hours(work)}
                      </div>
                    </div>
                  </div>
                  <div data-track className="relative h-16">
                    {hoursTicks.map((h) => (
                      <span key={h} className="absolute inset-y-0 border-l border-line/70" style={{ left: pct(h) }} />
                    ))}
                    <span className="absolute inset-y-0 bg-bg/70" style={{ left: 0, width: pct(toMin(store.open)) }} />
                    <span className="absolute inset-y-0 right-0 bg-bg/70" style={{ left: pct(toMin(store.close)) }} />
                    {leave && (
                      <div className="absolute inset-y-3 flex items-center rounded-md bg-bg px-3 text-xs text-muted" style={{ left: pct(toMin(store.open)), right: `calc(100% - ${pct(toMin(store.close))})` }}>
                        연차 · 8h 유급
                      </div>
                    )}
                    {mine.map((s) => {
                      const kind = blockKind(s, store, v.issues);
                      const br = breakRange(s);
                      const ghostMove = ghost && suggestion?.moves.find((m) => m.shiftId === s.id);
                      return (
                        <div
                          key={s.id}
                          className={cx('absolute inset-y-2 rounded-md border-[1.5px] select-none touch-none', barClass[kind], drag?.orig.id === s.id && 'shadow-md')}
                          style={{ left: pct(toMin(s.start)), width: `${((toMin(s.end) - toMin(s.start)) / span) * 100}%` }}
                          onPointerDown={(e) => begin(e, 'move', s)}
                          onDoubleClick={() => onOpen({ date, shift: s })}
                          title="드래그: 이동 · 양 끝: 출퇴근 조정 · 더블클릭: 상세 편집"
                        >
                          {br && (
                            <span
                              onPointerDown={(e) => begin(e, 'break', s)}
                              className="absolute inset-y-0 cursor-ew-resize bg-[repeating-linear-gradient(135deg,transparent_0_4px,rgb(0_0_0/0.12)_4px_6px)]"
                              style={{ left: `${((br[0] - toMin(s.start)) / (toMin(s.end) - toMin(s.start))) * 100}%`, width: `${(s.breakMinutes / (toMin(s.end) - toMin(s.start))) * 100}%` }}
                              title={`휴게 ${fromMin(br[0])}–${fromMin(br[1])} (드래그로 이동)`}
                            />
                          )}
                          {ghostMove && (
                            <span
                              className="pointer-events-none absolute inset-y-[-3px] rounded border-[1.5px] border-dashed border-brand bg-brand-subtle/60"
                              style={{
                                left: `${((toMin(ghostMove.to) - toMin(s.start)) / (toMin(s.end) - toMin(s.start))) * 100}%`,
                                width: `${(s.breakMinutes / (toMin(s.end) - toMin(s.start))) * 100}%`,
                              }}
                            />
                          )}
                          <span className="pointer-events-none relative block truncate px-2.5 pt-1 text-xs font-bold">
                            {s.tentative ? '시간 미정 · AI 추천' : `${s.start}–${s.end}`}
                          </span>
                          <span className="pointer-events-none relative block truncate px-2.5 text-[10px] opacity-80">
                            {s.partId ? store.parts.find((x) => x.id === s.partId)?.name : '유동'}
                            {s.breakMinutes > 0 && ` · 휴게 ${s.breakMinutes}분`}
                          </span>
                          <span onPointerDown={(e) => begin(e, 'start', s)} className="absolute inset-y-0 -left-1 w-2.5 cursor-ew-resize" />
                          <span onPointerDown={(e) => begin(e, 'end', s)} className="absolute inset-y-0 -right-1 w-2.5 cursor-ew-resize" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {people.length === 0 && <div className="p-8 text-center text-sm text-muted">이날 배치된 근무가 없습니다.</div>}

          </div>
        </Card>
        <p className="text-xs text-muted">막대를 끌어 이동, 양 끝을 끌어 출퇴근 시각 조정(15분 단위), 빗금 구간을 끌어 휴게 이동. 더블클릭하면 상세 편집.</p>
      </div>

      <aside className="space-y-4">
        {suggestion && (
          <Card className="border-brand/40 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">휴게 조정 제안</h3>
              <label className="flex items-center gap-1 text-[11px] text-muted">
                <input type="checkbox" checked={ghost} onChange={(e) => setGhost(e.target.checked)} className="accent-brand" />
                미리보기
              </label>
            </div>
            <ul className="mt-2 space-y-1 text-[13px]">
              {suggestion.moves.map((m) => (
                <li key={m.shiftId}>
                  <b>{nameOf(m.staffId)}</b> 휴게 {m.from} → <b className="text-brand">{m.to}</b>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">
              부족 {suggestion.shortageBefore}슬롯 → {suggestion.shortageAfter}슬롯 · 근무시간·인건비 변동 없음
            </p>
            <Button variant="primary" size="sm" className="mt-3 w-full" onClick={applySuggestion}>
              제안 적용
            </Button>
          </Card>
        )}

        <Card className="p-4">
          <h3 className="text-sm font-bold">근로시간 점검</h3>
          <ul className="mt-2 divide-y divide-line">
            {dayShifts.map((s) => {
              const w = workMin(s);
              const ok = s.breakMinutes >= requiredBreak(w);
              const errs = v.issues.filter((i) => i.shiftId === s.id && i.severity === 'error');
              return (
                <li key={s.id} className="flex items-center justify-between gap-2 py-1.5 text-[13px]">
                  <span className="truncate">
                    {nameOf(s.staffId)} <span className="text-muted">{hours(w)}</span>
                  </span>
                  {errs.length ? (
                    <Badge tone="danger">{errs[0].ruleId}</Badge>
                  ) : ok ? (
                    <Badge tone="success">휴게 {s.breakMinutes}분 ✓</Badge>
                  ) : (
                    <Badge tone="danger">휴게 부족</Badge>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </aside>
    </div>
  );
}
