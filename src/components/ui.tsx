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
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  href?: string;
};

const buttonBase =
  "inline-flex items-center justify-center gap-2 text-center leading-tight rounded-[var(--radius-sm)] font-semibold transition-colors rp-focus disabled:pointer-events-none disabled:opacity-50 [&>svg]:shrink-0";

const variants = {
  primary: "bg-[var(--accent)] text-white shadow-sm shadow-[#0076d5]/25 hover:bg-[var(--accent-hover)]",
  secondary:
    "border border-[var(--border-strong)] bg-white text-[var(--foreground)] shadow-sm hover:border-[var(--accent)] hover:text-[var(--accent-ink)]",
  outline:
    "rounded-full border border-[#b9d6f2] bg-white text-[var(--accent-ink)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]",
  ghost: "text-[var(--foreground)] hover:bg-[var(--muted)] hover:text-[var(--accent-ink)]",
  danger: "bg-[var(--danger)] text-white shadow-sm hover:bg-[#b91c1c]",
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
    // Route handlers are not pages: a <Link> would prefetch (and run) them on every render.
    if (href.startsWith("/api/")) {
      return (
        <a href={href} className={classes}>
          {children}
        </a>
      );
    }
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
    neutral: "bg-[#eef3f8] text-[#3d5266] border-[#d3deea]",
    success: "bg-[var(--success-soft)] text-[var(--success-ink)] border-[#bfe3cb]",
    warning: "bg-[var(--warning-soft)] text-[var(--warning-ink)] border-[#f6d9a4]",
    danger: "bg-[var(--danger-soft)] text-[#b91c1c] border-[#f3c1c1]",
    info: "bg-[var(--info-soft)] text-[#005fb0] border-[#c3dcf4]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[12px] font-semibold",
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
  icon,
}: {
  className?: string;
  children: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
  /** Remove body padding (use for tables / lists that run edge to edge). */
  flush?: boolean;
  /** Small icon shown before the title. */
  icon?: ReactNode;
}) {
  return (
    <div className={cn("rp-card min-w-0", flush && "overflow-hidden", className)}>
      {(title || description || action) && (
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-4">
          <div className="flex min-w-0 items-start gap-2.5">
            {icon && <span className="mt-0.5 shrink-0 text-[var(--accent-ink)] [&>svg]:h-5 [&>svg]:w-5">{icon}</span>}
            <div className="min-w-0">
            {title && (
              <h2 className="rp-display text-[18px] font-bold leading-snug text-[var(--foreground)]">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted-fg)]">{description}</p>
            )}
            </div>
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={flush ? undefined : "px-5 pb-5 pt-3"}>{children}</div>
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
      className="rp-focus inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent-ink)] hover:text-[var(--accent-hover)] hover:underline"
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
  sub,
  progress,
}: {
  label: string;
  value: string | number;
  icon?: ReactNode;
  href?: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  /** Small secondary figure shown as a pill (e.g. a live percentage). */
  hint?: string;
  /** Optional muted line under the value (e.g. "Planned: 9 | Installed: 4"). */
  sub?: string;
  /** Optional 0-100 bar along the bottom of the card. */
  progress?: number;
}) {
  const tones = {
    neutral: "bg-[#eef3f8] text-[#3d5a7a]",
    success: "bg-[var(--success-soft)] text-[var(--success-ink)]",
    warning: "bg-[var(--warning-soft)] text-[#e07b00]",
    danger: "bg-[var(--danger-soft)] text-[var(--danger-ink)]",
    info: "bg-[var(--accent-soft)] text-[var(--accent-ink)]",
  };
  const pillTones = {
    neutral: "bg-[#eef3f8] text-[#3d5266]",
    success: "bg-[var(--success-soft)] text-[var(--success-ink)]",
    warning: "bg-[var(--warning-soft)] text-[var(--warning-ink)]",
    danger: "bg-[var(--danger-soft)] text-[#b91c1c]",
    info: "bg-[var(--accent-soft)] text-[#005fb0]",
  };
  const barTones = {
    neutral: "bg-[#94a9c2]",
    success: "bg-[var(--success)]",
    warning: "bg-[var(--warning)]",
    danger: "bg-[var(--danger)]",
    info: "bg-[var(--accent)]",
  };
  const inner = (
    <div
      className={cn(
        "rp-card flex h-full min-h-[96px] flex-col justify-center px-4 py-3.5",
        href && "transition-shadow hover:shadow-[var(--shadow-md)]",
      )}
    >
      <div className="flex items-center gap-3.5">
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
          <p className="line-clamp-2 text-[14px] font-semibold leading-tight text-[var(--foreground)]" title={label}>
            {label}
          </p>
          {/* The figure must never be truncated; the pill wraps below it instead. */}
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <p
              className={cn("rp-kpi whitespace-nowrap", typeof value === "string" && value.length > 5 && "text-[22px] leading-[1.6]")}
              title={typeof value === "string" ? value : undefined}
            >
              {typeof value === "number" ? value.toLocaleString("en-US") : value}
            </p>
            {hint && (
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums", pillTones[tone])}>
                {hint}
              </span>
            )}
          </div>
          {sub && (
            <p className="truncate text-[12px] text-[var(--muted-fg)]" title={sub}>
              {sub}
            </p>
          )}
        </div>
      </div>
      {progress !== undefined && (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[var(--muted)]" aria-hidden>
          <div className={cn("h-full rounded-full", barTones[tone])} style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      )}
    </div>
  );
  if (href) {
    const Anchor = href.startsWith("/api/") ? "a" : Link;
    return (
      <Anchor href={href} className="block h-full rp-focus rounded-[var(--radius)]">
        {inner}
      </Anchor>
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
  // Small rings cannot fit one decimal; floor so an unfinished project never reads "100%".
  const compact = size < 48;
  const label = compact ? String(Math.floor(pct)) : pct >= 99.95 ? "100" : pct.toFixed(1);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} title={`${pct.toFixed(1)}%`}>
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
      <span
        className={cn(
          "rp-mono absolute inset-0 flex items-center justify-center font-bold text-[var(--foreground)]",
          compact ? "text-[10px]" : "text-[10.5px]",
        )}
      >
        {label}%
      </span>
    </div>
  );
}

export function ProgressBar({
  value,
  max = 100,
  label,
  ariaLabel,
  className,
}: {
  value: number;
  max?: number;
  label?: string;
  /** Accessible name when no visible label is shown. */
  ariaLabel?: string;
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
      <div className="h-2.5 overflow-hidden rounded-full bg-[var(--muted)]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--cyan)] transition-all"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-label={ariaLabel || label || "Progress"}
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
    danger: "border-l-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
    info: "border-l-[var(--accent)] bg-[var(--info-soft)] text-[#005fb0]",
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
        <h1 className="rp-display text-[24px] font-bold leading-tight text-[var(--foreground)] sm:text-[30px]">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-[var(--muted-fg)]">
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
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-ink)]">
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
    <div role="alert" className="rounded-[var(--radius)] border border-[#efb4b7] border-l-4 border-l-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger-ink)]">
      {message}
    </div>
  );
}
