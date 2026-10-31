import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { keys, useStaff, useStore } from '../api/queries';
import PageHeader from '../components/PageHeader';
import { Button, Card, cx, Loading } from '../components/ui';
import { addMonths, md, monthEnd, monthLabel, monthOf, ymd } from '../lib/time';
import type { GenerateRequest } from '../types';

const STEPS = ['매장 조건·가능 시간 분석', '직원 출근 시간 배치', '알바생 파트 배치', '근로 규칙 검증·보정'];

function Choice({ active, onClick, title, desc }: { active: boolean; onClick: () => void; title: string; desc: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx('rounded-lg border p-4 text-left', active ? 'border-brand bg-brand-subtle ring-1 ring-brand' : 'border-line hover:bg-bg')}
    >
      <div className="text-sm font-bold">{title}</div>
      <div className="mt-1 text-xs text-muted">{desc}</div>
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="mb-2.5 text-sm font-bold">{title}</h2>
      {children}
    </div>
  );
}

export default function Generate() {
  const { data: staff } = useStaff();
  const { data: store } = useStore();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const thisMonth = monthOf(ymd(new Date()));
  const months = [0, 1, 2, 3].map((i) => addMonths(thisMonth, i));
  const [req, setReq] = useState<GenerateRequest>({
    periodStart: months[1],
    weeklyHolidayPay: 'MINIMIZE',
    priority: 'FAIRNESS',
    fillContractHours: true,
  });
  const [step, setStep] = useState(0);

  const gen = useMutation({
    mutationFn: api.generateSchedule,
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: keys.schedules });
      navigate(`/schedules/${s.id}`);
    },
  });

  useEffect(() => {
    if (!gen.isPending) return setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 600);
    return () => clearInterval(t);
  }, [gen.isPending]);

  if (!staff || !store) return <Loading />;
  const fullTime = staff.filter((s) => s.employmentType === 'FULL_TIME');
  const set = (p: Partial<GenerateRequest>) => setReq((r) => ({ ...r, ...p }));

  if (gen.isPending)
    return (
      <Card className="mx-auto mt-10 max-w-md p-8">
        <h1 className="text-lg font-bold">Gemini가 근무표를 만들고 있어요</h1>
        <p className="mt-1 text-sm text-muted">{monthLabel(req.periodStart)} · 직원 {fullTime.length}명 · 알바생 {staff.length - fullTime.length}명</p>
        <ol className="mt-6 space-y-3">
          {STEPS.map((s, i) => (
            <li key={s} className={cx('flex items-center gap-3 text-sm', i > step && 'text-muted')}>
              <span
                className={cx(
                  'grid size-6 place-items-center rounded-full text-xs',
                  i < step ? 'bg-success text-white' : i === step ? 'animate-pulse bg-brand text-white' : 'bg-bg',
                )}
              >
                {i < step ? '✓' : i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>
      </Card>
    );

  return (
    <div className="max-w-3xl">
      <PageHeader title="AI 근무표 생성" sub="조건을 고르면 직원과 알바생을 함께 배치하고 근로기준법 규칙으로 검증합니다." />
      <Card className="space-y-7 p-6">
        <Section title="기간">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {months.map((m) => (
              <Choice key={m} active={req.periodStart === m} onClick={() => set({ periodStart: m })} title={monthLabel(m)} desc={`${md(m)} – ${md(monthEnd(m))}`} />
            ))}
          </div>
        </Section>
        <Section title="주휴수당">
          <div className="grid gap-2 sm:grid-cols-2">
            <Choice active={req.weeklyHolidayPay === 'MINIMIZE'} onClick={() => set({ weeklyHolidayPay: 'MINIMIZE' })} title="최소화" desc="알바생을 가능하면 주 15시간 미만으로 배치" />
            <Choice active={req.weeklyHolidayPay === 'ALLOW'} onClick={() => set({ weeklyHolidayPay: 'ALLOW' })} title="허용" desc="희망 근무시간을 우선하고 주휴수당은 계산만" />
          </div>
        </Section>
        <Section title="우선순위">
          <div className="grid gap-2 sm:grid-cols-2">
            <Choice active={req.priority === 'FAIRNESS'} onClick={() => set({ priority: 'FAIRNESS' })} title="공평 배분" desc="알바생 간 근무시간 차이를 줄임" />
            <Choice active={req.priority === 'COST'} onClick={() => set({ priority: 'COST' })} title="인건비 절감" desc="필요 인원만큼만 최소 배치" />
          </div>
        </Section>
        <Section title={`직원 (${fullTime.length}명 · 유동 근무)`}>
          <label className="flex items-start gap-2.5 rounded-lg border border-line p-4">
            <input type="checkbox" className="mt-0.5 size-4 accent-brand" checked={req.fillContractHours} onChange={(e) => set({ fillContractHours: e.target.checked })} />
            <span>
              <span className="block text-sm font-bold">계약 근로시간을 먼저 채우기</span>
              <span className="mt-0.5 block text-xs text-muted">
                직원 출근 시각을 인력이 부족한 시간대에 맞춰 날마다 다르게 정하고, 남는 시간대를 알바생 파트로 채웁니다. 연차가 있는 날은 비워 둡니다.
              </span>
            </span>
          </label>
        </Section>
        {gen.error && <p className="text-sm text-danger">생성 실패: {gen.error.message}. 잠시 후 다시 시도하거나 템플릿을 적용하세요.</p>}
        <div className="flex justify-end">
          <Button variant="primary" onClick={() => gen.mutate(req)}>
            근무표 생성
          </Button>
        </div>
      </Card>
    </div>
  );
}
