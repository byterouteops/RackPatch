import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  href?: string;
};

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] font-semibold transition-colors rp-focus disabled:pointer-events-none disabled:opacity-50";

const variants = {
  primary:
    "bg-[var(--accent)] text-white shadow-sm shadow-blue-600/25 hover:bg-[var(--accent-hover)]",
  secondary:
    "border border-[var(--border-strong)] bg-white text-[var(--foreground)] shadow-sm hover:border-[var(--accent)] hover:text-[var(--accent)]",
  ghost: "text-[var(--foreground)] hover:bg-[var(--muted)] hover:text-[var(--accent)]",
  danger: "bg-[var(--danger)] text-white shadow-sm hover:bg-[#a81f26]",
};

const sizes = {
  sm: "h-9 px-3.5 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-sm min-h-[44px]",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  href,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(buttonBase, variants[variant], sizes[size], className);
  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button type={props.type ?? "button"} className={classes} {...props}>
      {children}
    </button>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)] shadow-sm placeholder:text-[var(--muted-fg)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)] shadow-sm focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-[120px] w-full rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-fg)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]",
        className,
      )}
      {...props}
    />
  );
}

export function Badge({
  className,
  children,
  tone = "neutral",
}: {
  className?: string;
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  const tones = {
    neutral: "bg-[#eef2f6] text-[#3d5266] border-[#c5d0db]",
    success: "bg-[var(--success-soft)] text-[var(--success-ink)] border-[#b7df9e]",
    warning: "bg-[var(--warning-soft)] text-[var(--warning-ink)] border-[#f0d48a]",
    danger: "bg-[var(--danger-soft)] text-[var(--danger)] border-[#efb4b7]",
    info: "bg-[var(--info-soft)] text-[var(--accent)] border-[#bfdbfe]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11.5px] font-semibold",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Card({
  className,
  children,
  title,
  description,
  action,
  flush,
}: {
  className?: string;
  children: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
  /** Remove body padding (use for tables / lists that run edge to edge). */
  flush?: boolean;
}) {
  return (
    <div className={cn("rp-card", flush && "overflow-hidden", className)}>
      {(title || description || action) && (
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)]/70 px-5 py-3.5">
          <div className="min-w-0">
            {title && (
              <h2 className="rp-display text-[16px] font-bold text-[var(--foreground)]">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted-fg)]">{description}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={flush ? undefined : "p-5"}>{children}</div>
    </div>
  );
}

/** Label + value pair for detail grids (use inside a <dl>). */
export function DetailItem({
  label,
  children,
  mono,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="rp-panel-title">{label}</dt>
      <dd className={cn("mt-1 text-sm font-medium text-[var(--foreground)]", mono && "rp-mono")}>
        {children}
      </dd>
    </div>
  );
}

/** Small inline link used for secondary navigation in headers and card actions. */
export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="rp-focus inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)] hover:underline"
    >
      {children}
    </Link>
  );
}

export function StatCard({
  label,
  value,
  icon,
  href,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string | number;
  icon?: ReactNode;
  href?: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  /** Small secondary figure shown bottom-right (e.g. a live percentage). */
  hint?: string;
}) {
  const tones = {
    neutral: "bg-slate-100 text-slate-600",
    success: "bg-[var(--success-soft)] text-[var(--success)]",
    warning: "bg-[var(--warning-soft)] text-[var(--warning)]",
    danger: "bg-[var(--danger-soft)] text-[var(--danger)]",
    info: "bg-[var(--accent-soft)] text-[var(--accent)]",
  };
  const hintTones = {
    neutral: "text-[var(--muted-fg)]",
    success: "text-[var(--success)]",
    warning: "text-[var(--warning)]",
    danger: "text-[var(--danger)]",
    info: "text-[var(--accent)]",
  };
  const inner = (
    <div
      className={cn(
        "rp-card flex items-center gap-4 px-5 py-4",
        href && "transition-shadow hover:shadow-[var(--shadow-md)]",
      )}
    >
      {icon && (
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-full [&>svg]:h-6 [&>svg]:w-6",
            tones[tone],
          )}
        >
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium leading-tight text-[var(--muted-fg)]">{label}</p>
        <div className="mt-0.5 flex items-end justify-between gap-2">
          <p className="rp-display text-[26px] font-extrabold leading-tight tracking-tight text-[var(--foreground)]">
            {typeof value === "number" ? value.toLocaleString("en-US") : value}
          </p>
          {hint && (
            <span className={cn("pb-1 text-[13px] font-semibold", hintTones[tone])}>{hint}</span>
          )}
        </div>
      </div>
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block rp-focus rounded-[var(--radius)]">
        {inner}
      </Link>
    );
  }
  return inner;
}

export function ProgressRing({
  value,
  max,
  size = 52,
  tone = "success",
}: {
  value: number;
  max: number;
  size?: number;
  tone?: "success" | "info";
}) {
  const pct = max <= 0 ? 0 : Math.min(100, (value / max) * 100);
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = tone === "success" ? "var(--success)" : "var(--accent)";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
        />
      </svg>
      <span className="rp-mono absolute inset-0 flex items-center justify-center text-[10.5px] font-bold text-[var(--foreground)]">
        {pct >= 99.95 ? "100" : pct.toFixed(1)}%
      </span>
    </div>
  );
}

export function ProgressBar({
  value,
  max = 100,
  label,
  className,
}: {
  value: number;
  max?: number;
  label?: string;
  className?: string;
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between text-xs">
        {label && <span className="font-semibold text-[var(--foreground)]">{label}</span>}
        <span className="rp-mono text-[var(--muted-fg)]">
          {value}/{max} ({pct}%)
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[var(--muted)] shadow-inner">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[#60a5fa] transition-all"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
        />
      </div>
    </div>
  );
}

export function AlertBanner({
  tone = "warning",
  title,
  children,
}: {
  tone?: "success" | "warning" | "danger" | "info";
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    success: "border-l-[var(--success)] bg-[var(--success-soft)] text-[var(--success-ink)]",
    warning: "border-l-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
    danger: "border-l-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]",
    info: "border-l-[var(--accent)] bg-[var(--info-soft)] text-[#036a91]",
  };
  return (
    <div
      role="alert"
      className={cn(
        "rounded-[var(--radius)] border border-[var(--border)] border-l-4 px-4 py-3",
        tones[tone],
      )}
    >
      {title && <p className="text-sm font-semibold">{title}</p>}
      <div className={cn("text-sm", title && "mt-1")}>{children}</div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 border-b border-[var(--border)] pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {breadcrumb && <div className="mb-1.5 text-xs text-[var(--muted-fg)]">{breadcrumb}</div>}
        <h1 className="rp-display text-[28px] font-extrabold leading-tight text-[var(--foreground)] sm:text-[32px]">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-[var(--muted-fg)]">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-white px-6 py-12 text-center">
      {icon && (
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
          {icon}
        </div>
      )}
      <p className="rp-display font-semibold text-[var(--foreground)]">{title}</p>
      {description && (
        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted-fg)]">{description}</p>
      )}
      {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-[#efb4b7] border-l-4 border-l-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
      {message}
    </div>
  );
}
