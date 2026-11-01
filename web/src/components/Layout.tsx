import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useStore } from '../api/queries';
import { useAuth } from '../store/auth';
import { cx } from './ui';

const NAV = [
  { to: '/', label: '대시보드', end: true },
  { to: '/schedules', label: '근무표' },
  { to: '/staff', label: '직원·알바생 관리' },
  { to: '/templates', label: '템플릿' },
  { to: '/settings', label: '매장 설정' },
];

export default function Layout() {
  const { data: store } = useStore();
  const { user, setUser } = useAuth();
  const { pathname, search } = useLocation();
  // 로그인 안 했으면 로그인 화면으로, 끝나면 원래 가려던 곳으로 돌아온다
  if (!user) return <Navigate to="/login" replace state={{ from: pathname + search }} />;
  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-line bg-surface md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center gap-3 px-4 pt-4 pb-3 md:px-6 md:pt-6 md:pb-6">
          <span className="grid size-8 place-items-center rounded-lg bg-brand font-bold text-white">오</span>
          <div className="leading-tight">
            <div className="font-bold">오토스케줄</div>
            <div className="text-xs text-muted">{store ? [store.name, store.branch].filter(Boolean).join(' · ') : ' '}</div>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:px-4">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx(
                  'flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm',
                  isActive ? 'bg-brand-subtle font-medium text-brand' : 'text-muted hover:bg-bg hover:text-ink',
                )
              }
            >
              <span className="size-1.5 rounded-full bg-current" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2 border-t border-line px-4 py-3 md:mt-auto md:px-6 md:py-4">
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="truncate text-xs text-muted">{user.email}</div>
          </div>
          <button onClick={() => setUser(null)} className="shrink-0 text-xs text-muted hover:text-ink">
            로그아웃
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <Outlet />
      </main>
    </div>
  );
}
