import { isMock, resetMock } from '../api';
import { useStore } from '../api/queries';
import PageHeader from '../components/PageHeader';
import { Badge, Button, Card, Loading } from '../components/ui';
import { DAY_LABELS } from '../lib/time';

export default function Settings() {
  const { data: store } = useStore();
  if (!store) return <Loading />;
  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title="매장 설정" sub={`${store.name} ${store.branch}`} />
      <Card className="p-5">
        <h2 className="font-bold">기본 정보</h2>
        <dl className="mt-3 grid grid-cols-[120px_1fr] gap-y-2 text-sm">
          <dt className="text-muted">영업시간</dt>
          <dd>
            {store.open}–{store.close}
          </dd>
          <dt className="text-muted">사업장 규모</dt>
          <dd>{store.size === 'OVER_5' ? '5인 이상 (연장·야간 가산, 주 52시간 적용)' : '5인 미만'}</dd>
          <dt className="text-muted">최저시급</dt>
          <dd>{store.minimumWage.toLocaleString()}원 (2026년)</dd>
        </dl>
      </Card>
      <Card className="p-5">
        <h2 className="font-bold">알바생 근무 파트</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {store.parts.map((p) => (
            <li key={p.id} className="flex items-center gap-3">
              <Badge tone="brand">{p.name}</Badge>
              {p.start}–{p.end}
              <span className="text-muted">휴게 {p.breakMinutes}분</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">직원은 파트 없이 출퇴근 시각을 날마다 지정합니다.</p>
      </Card>
      <Card className="p-5">
        <h2 className="font-bold">시간대별 필요 인원</h2>
        <ul className="mt-3 space-y-1.5 text-sm">
          {store.demand.map((d, i) => (
            <li key={i}>
              {d.start}–{d.end} · <b>{d.required}명</b>
              {d.days && <span className="text-muted"> ({d.days.map((x) => DAY_LABELS[x]).join('·')}요일)</span>}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">커버리지 점검과 AI 배치의 기준입니다. 휴게 중인 인원은 빼고 셉니다.</p>
      </Card>
      {isMock && (
        <Card className="p-5">
          <h2 className="font-bold">데모 데이터</h2>
          <p className="mt-1 text-sm text-muted">백엔드 없이 브라우저에 저장된 예시 데이터로 동작 중입니다.</p>
          <Button
            className="mt-3"
            variant="danger"
            onClick={() => {
              if (!window.confirm('모든 변경을 지우고 예시 데이터로 되돌릴까요?')) return;
              resetMock();
              window.location.href = '/';
            }}
          >
            예시 데이터로 초기화
          </Button>
        </Card>
      )}
    </div>
  );
}
