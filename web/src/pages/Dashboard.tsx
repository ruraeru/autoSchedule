import { Link } from 'react-router-dom';
import { useSchedules, useStaff, useStore } from '../api/queries';
import PageHeader from '../components/PageHeader';
import { Avatar, Badge, Button, Card, Loading, Stat } from '../components/ui';
import { DAY_LABELS, dayIndex, hours, shortRange, weekLabel, won } from '../lib/time';
import { useValidation } from '../lib/useValidation';

export default function Dashboard() {
  const { data: store } = useStore();
  const { data: staff } = useStaff();
  const { data: schedules } = useSchedules();
  const current = schedules?.[0];
  const v = useValidation(current, staff, store);

  if (!schedules || !staff || !store) return <Loading />;

  const newButton = (
    <Link to="/schedules/new">
      <Button variant="primary">AI 근무표 생성</Button>
    </Link>
  );

  if (!current || !v)
    return (
      <div>
        <PageHeader title="대시보드" actions={newButton} />
        <Card className="p-10 text-center text-sm text-muted">아직 근무표가 없습니다. 조건만 고르면 AI가 이번 주 근무표를 만들어 드려요.</Card>
      </div>
    );

  const fullTime = staff.filter((s) => s.employmentType === 'FULL_TIME');
  const attention = v.issues.filter((i) => i.severity !== 'warning' || i.ruleId === 'S-01');

  return (
    <div>
      <PageHeader
        title="안녕하세요, 김사장님"
        sub={`${weekLabel(current.periodStart)} 근무표 · ${current.status === 'CONFIRMED' ? '확정됨' : '작성 중'}`}
        actions={
          <>
            <Link to={`/schedules/${current.id}`}>
              <Button>근무표 열기</Button>
            </Link>
            {newButton}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="이번 주 총 근무시간" value={hours(v.totals.workMin)} sub={`직원 ${fullTime.length}명 · 알바생 ${staff.length - fullTime.length}명`} />
        <Stat label="예상 인건비" value={won(v.totals.cost)} sub={`주휴수당 ${won(v.totals.holidayPay)} 포함`} />
        <Stat label="주휴수당 대상" value={`${v.totals.weeklyHolidayCount}명`} sub="알바생 주 15시간 이상" />
        <Stat
          label="확인 필요"
          value={`${v.errorCount + v.tentativeCount}건`}
          sub={`위반 ${v.errorCount} · 시간 미정 ${v.tentativeCount}`}
          tone={v.errorCount ? 'danger' : v.tentativeCount ? 'warning' : undefined}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">직원 근무 현황</h2>
            <span className="text-xs text-muted">출근 시간이 날마다 다른 직원의 이번 주 일정</span>
          </div>
          <div className="mt-4 space-y-5">
            {fullTime.map((p) => {
              const w = v.weeks.get(p.id)!;
              const contract = (p.contractWeeklyHours ?? 40) * 60;
              const seg = (m: number) => `${Math.min(100, (m / contract) * 100)}%`;
              return (
                <div key={p.id}>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={p.name} fullTime />
                    <span className="text-sm font-bold">{p.name}</span>
                    <Badge tone="staff">{p.title}</Badge>
                    <span className="ml-auto text-xs text-muted">
                      {hours(w.workMin + w.tentativeMin + w.leaveMin)} / {p.contractWeeklyHours}h
                    </span>
                  </div>
                  <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-bg">
                    <span className="bg-staff" style={{ width: seg(w.workMin) }} />
                    <span className="bg-staff/40" style={{ width: seg(w.tentativeMin) }} />
                    <span className="bg-muted/40" style={{ width: seg(w.leaveMin) }} />
                  </div>
                  <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px]">
                    {DAY_LABELS.map((d, i) => {
                      const s = current.shifts.find((x) => x.staffId === p.id && dayIndex(x.date) === i);
                      const leave = current.leaves.some((l) => l.staffId === p.id && dayIndex(l.date) === i);
                      return (
                        <div key={d} className="rounded-md bg-bg px-1 py-1.5">
                          <div className="text-muted">{d}</div>
                          <div className={s?.tentative ? 'text-warning' : s ? 'font-medium text-staff' : 'text-muted'}>
                            {s ? (s.tentative ? '미정' : shortRange(s.start, s.end)) : leave ? '연차' : '휴무'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-bold">확인이 필요한 항목</h2>
          {attention.length === 0 && <p className="mt-3 text-sm text-success">모두 해결됨 — 근무표를 확정할 수 있어요.</p>}
          <ul className="mt-3 space-y-2">
            {attention.slice(0, 6).map((i, k) => (
              <li key={k} className="flex items-start gap-2 text-[13px]">
                <Badge tone={i.severity === 'error' ? 'danger' : 'warning'} className="mt-0.5">
                  {i.severity === 'error' ? '위반' : i.ruleId === 'T-01' ? '미정' : '부족'}
                </Badge>
                {i.message}
              </li>
            ))}
          </ul>
          <Link to={`/schedules/${current.id}`} className="mt-4 inline-block text-[13px] font-medium text-brand">
            근무표에서 해결하기 →
          </Link>
        </Card>
      </div>
    </div>
  );
}
