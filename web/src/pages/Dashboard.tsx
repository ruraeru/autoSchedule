import { Link } from 'react-router-dom';
import { useSchedules, useStaff, useStore } from '../api/queries';
import PageHeader from '../components/PageHeader';
import { Avatar, Badge, Button, Card, Loading, Stat } from '../components/ui';
import { DAY_LABELS, datesBetween, hours, md, monthLabel, shortRange, weeksOf, won, ymd } from '../lib/time';
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
        <Card className="p-10 text-center text-sm text-muted">아직 근무표가 없습니다. 조건만 고르면 AI가 한 달 근무표를 만들어 드려요.</Card>
      </div>
    );

  const fullTime = staff.filter((s) => s.employmentType === 'FULL_TIME');
  // 오늘이 든 주, 없으면 첫 온전한 주
  const weeks = weeksOf(datesBetween(current.periodStart, current.periodEnd));
  const today = ymd(new Date());
  const week = weeks.find((w) => w.includes(today)) ?? weeks.find((w) => w.every(Boolean)) ?? weeks[0];
  const days = week.filter((d): d is string => d !== null);

  return (
    <div>
      <PageHeader
        title="안녕하세요, 김사장님"
        sub={`${monthLabel(current.periodStart)} 근무표 · ${current.status === 'CONFIRMED' ? '확정됨' : '작성 중'}`}
        actions={
          <>
            <Link to={`/schedules/${current.id}`}>
              <Button>근무표 열기</Button>
            </Link>
            {newButton}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="이번 달 총 근무시간" value={hours(v.totals.workMin)} sub={`직원 ${fullTime.length}명 · 알바생 ${staff.length - fullTime.length}명`} />
        <Stat label="예상 인건비" value={won(v.totals.cost)} sub={`주휴수당 ${won(v.totals.holidayPay)} 포함`} />
        <Stat label="주휴수당 대상" value={`${v.totals.weeklyHolidayCount}명`} sub="알바생 주 15시간 이상" />
      </div>

      <div className="mt-6">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">직원 근무 현황</h2>
            <span className="text-xs text-muted">출근 시간이 날마다 다른 직원의 {md(days[0])}–{md(days[days.length - 1])} 일정</span>
          </div>
          <div className="mt-4 space-y-5">
            {fullTime.map((p) => {
              const w = v.weeks.get(days[0])!.get(p.id)!;
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
                      const s = current.shifts.find((x) => x.staffId === p.id && x.date === week[i]);
                      const leave = current.leaves.some((l) => l.staffId === p.id && l.date === week[i]);
                      return (
                        <div key={d} className="rounded-md bg-bg px-1 py-1.5">
                          <div className="text-muted">{d}</div>
                          <div className={s?.tentative ? 'text-warning' : s ? 'font-medium text-staff' : 'text-muted'}>
                            {!week[i] ? '–' : s ? (s.tentative ? '미정' : shortRange(s.start, s.end)) : leave ? '연차' : '휴무'}
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
      </div>
    </div>
  );
}
