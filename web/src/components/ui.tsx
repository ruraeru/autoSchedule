// Figma 컴포넌트(Button, Badge, ShiftBlock, NavItem)와 대응하는 공통 UI
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' }) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        size === 'md' ? 'h-10 px-4 text-sm' : 'h-8 px-3 text-[13px]',
        variant === 'primary' && 'bg-brand text-white hover:bg-brand/90',
        variant === 'secondary' && 'border border-line bg-surface hover:bg-bg',
        variant === 'ghost' && 'text-muted hover:bg-bg hover:text-ink',
        variant === 'danger' && 'border border-danger/30 bg-surface text-danger hover:bg-danger-subtle',
        className,
      )}
      {...props}
    />
  );
}

export type Tone = 'neutral' | 'brand' | 'danger' | 'warning' | 'success' | 'staff';

const toneClass: Record<Tone, string> = {
  neutral: 'bg-bg text-muted',
  brand: 'bg-brand-subtle text-brand',
  danger: 'bg-danger-subtle text-danger',
  warning: 'bg-warning-subtle text-warning',
  success: 'bg-success-subtle text-success',
  staff: 'bg-staff-bg text-staff',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium whitespace-nowrap', toneClass[tone], className)}>
      {children}
    </span>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('rounded-xl border border-line bg-surface', className)}>{children}</section>;
}

export function Avatar({ name, fullTime }: { name: string; fullTime?: boolean }) {
  return (
    <span
      className={cx(
        'grid size-7 shrink-0 place-items-center rounded-full text-xs font-medium',
        fullTime ? 'bg-staff-bg text-staff' : 'bg-brand-subtle text-brand',
      )}
    >
      {name[0]}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-line/60 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'h-8 rounded-md px-3.5 text-[13px] transition-colors',
            o.value === value ? 'bg-surface font-medium shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export type BlockKind = 'open' | 'middle' | 'close' | 'staff' | 'tentative' | 'leave';

const blockClass: Record<BlockKind, string> = {
  open: 'bg-open-bg text-open border-l-[3px] border-open',
  middle: 'bg-middle-bg text-middle border-l-[3px] border-middle',
  close: 'bg-close-bg text-close border-l-[3px] border-close',
  staff: 'bg-staff-bg text-staff border-l-[3px] border-staff',
  tentative: 'bg-surface text-staff border-[1.5px] border-dashed border-staff',
  leave: 'bg-bg text-muted',
};

export function ShiftBlock({
  kind,
  title,
  sub,
  onClick,
  className,
}: {
  kind: BlockKind;
  title: ReactNode;
  sub?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx('block w-full rounded-md px-2.5 py-1.5 text-left leading-tight hover:brightness-[0.97]', blockClass[kind], className)}
    >
      <span className="block truncate text-[13px] font-bold">{title}</span>
      {sub && <span className="mt-0.5 block truncate text-[11px] opacity-90">{sub}</span>}
    </button>
  );
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-surface shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-bold">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="닫기">
            ✕
          </button>
        </header>
        <div className="space-y-4 px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

/** 너비 없는 입력칸 모양. 너비를 따로 줄 때 쓴다 (inputClass의 w-full이 다른 너비를 이기므로) */
export const inputBase =
  'h-10 rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15';
export const inputClass = `${inputBase} w-full`;

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'danger' | 'warning' }) {
  return (
    <Card className="p-5">
      <div className="text-[13px] text-muted">{label}</div>
      <div className={cx('mt-1.5 text-2xl font-bold', tone === 'danger' && 'text-danger', tone === 'warning' && 'text-warning')}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </Card>
  );
}

export function Loading() {
  return <div className="p-10 text-sm text-muted">불러오는 중…</div>;
}
