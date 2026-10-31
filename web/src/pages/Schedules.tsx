import { Link } from 'react-router-dom';
import { useSchedules } from '../api/queries';
import PageHeader from '../components/PageHeader';
import { Badge, Button, Card, Loading } from '../components/ui';
import { md, weekLabel } from '../lib/time';

const SOURCE = { AI: 'AI 생성', TEMPLATE: '템플릿', MANUAL: '직접 작성' };

export default function Schedules() {
  const { data } = useSchedules();
  if (!data) return <Loading />;
  return (
    <div>
      <PageHeader
        title="근무표"
        sub="주 단위 근무표 목록"
        actions={
          <Link to="/schedules/new">
            <Button variant="primary">AI 근무표 생성</Button>
          </Link>
        }
      />
      <Card>
        {data.length === 0 && <p className="p-8 text-center text-sm text-muted">근무표가 없습니다.</p>}
        <ul className="divide-y divide-line">
          {data.map((s) => (
            <li key={s.id}>
              <Link to={`/schedules/${s.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-bg">
                <div className="flex-1">
                  <div className="font-bold">{weekLabel(s.periodStart)}</div>
                  <div className="text-xs text-muted">
                    {md(s.periodStart)} – {md(s.periodEnd)} · 근무 {s.shifts.length}건 · {SOURCE[s.source]}
                  </div>
                </div>
                <Badge tone={s.status === 'CONFIRMED' ? 'success' : 'neutral'}>{s.status === 'CONFIRMED' ? '확정' : '작성 중'}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
