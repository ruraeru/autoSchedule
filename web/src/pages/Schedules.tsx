import { Link } from 'react-router-dom';
import { useSchedules } from '../api/queries';
import Icon from '../components/Icon';
import PageHeader from '../components/PageHeader';
import { Badge, Button, Card, Loading } from '../components/ui';
import { md, monthLabel } from '../lib/time';

const SOURCE = { AI: 'AI 생성', TEMPLATE: '템플릿', MANUAL: '직접 작성' };

export default function Schedules() {
  const { data } = useSchedules();
  if (!data) return <Loading />;
  return (
    <div>
      <PageHeader
        title="근무표"
        sub="월 단위 근무표 목록"
        actions={
          <>
            <Link to="/schedules/manual">
              <Button>직접 만들기</Button>
            </Link>
            <Link to="/schedules/new">
              <Button variant="primary">AI 근무표 생성</Button>
            </Link>
          </>
        }
      />
      <Card>
        {data.length === 0 && <p className="p-8 text-center text-sm text-muted">근무표가 없습니다.</p>}
        <ul className="divide-y divide-line">
          {data.map((s) => (
            <li key={s.id}>
              <Link to={`/schedules/${s.id}`} className="flex items-center gap-3 px-6 py-4 hover:bg-bg">
                <div className="flex-1">
                  <div className="text-sm font-medium">{monthLabel(s.periodStart)}</div>
                  <div className="text-xs text-muted">
                    {md(s.periodStart)} – {md(s.periodEnd)} · 근무 {s.shifts.length}건 · {SOURCE[s.source]}
                  </div>
                </div>
                {s.status === 'CONFIRMED' ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-success">
                    <Icon name="check" size={14} />
                    확정
                  </span>
                ) : (
                  <Badge>작성 중</Badge>
                )}
                <Icon name="chevron-right" className="text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
