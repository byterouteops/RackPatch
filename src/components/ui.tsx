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
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius)] font-semibold tracking-wide transition-colors rp-focus disabled:pointer-events-none disabled:opacity-50";

const variants = {
  primary: "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]",
  secondary:
    "border border-[var(--border)] bg-white text-[var(--foreground)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
  ghost: "text-[var(--foreground)] hover:bg-[var(--muted)] hover:text-[var(--accent)]",
  danger: "bg-[var(--danger)] text-white hover:bg-[#a81f26]",
};

const sizes = {
  sm: "h-8 px-3 text-xs uppercase tracking-[0.04em]",
  md: "h-9 px-4 text-sm",
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
        "h-9 w-full rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-fg)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]",
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
        "h-9 w-full rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]",
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
    info: "bg-[var(--info-soft)] text-[#036a91] border-[#9ad4ee]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[2px] border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em]",
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
}: {
  className?: string;
  children: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className={cn("rp-card", className)}>
      {(title || description || action) && (
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[#f7fafc] px-4 py-3">
          <div>
            {title && (
              <h2 className="text-sm font-semibold tracking-wide text-[var(--foreground)]">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-0.5 text-xs text-[var(--muted-fg)]">{description}</p>
            )}
          </div>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon,
  href,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  icon?: ReactNode;
  href?: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  const tones = {
    neutral: "bg-[#eef2f6] text-[#3d5266]",
    success: "bg-[var(--success-soft)] text-[var(--success-ink)]",
    warning: "bg-[var(--warning-soft)] text-[var(--warning-ink)]",
    danger: "bg-[var(--danger-soft)] text-[var(--danger)]",
    info: "bg-[var(--accent-soft)] text-[var(--accent)]",
  };
  const inner = (
    <div className="rp-card border-l-4 border-l-[var(--accent)] p-4 transition-colors hover:bg-[#f7fafc]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="rp-panel-title">{label}</p>
          <p className="rp-mono mt-1.5 text-2xl font-semibold tracking-tight text-[var(--foreground)]">
            {value}
          </p>
        </div>
        {icon && <div className={cn("rounded-[var(--radius)] p-2", tones[tone])}>{icon}</div>}
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
      <div className="h-1.5 overflow-hidden rounded-[1px] bg-[#d7e0e8]">
        <div
          className="h-full bg-[var(--accent)] transition-all"
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
        <h1 className="text-xl font-semibold tracking-tight text-[var(--foreground)] sm:text-2xl">
          {title}
        </h1>
        {description && <p className="mt-1 text-sm text-[var(--muted-fg)]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-white px-6 py-12 text-center">
      <p className="font-semibold text-[var(--foreground)]">{title}</p>
      {description && <p className="mt-2 text-sm text-[var(--muted-fg)]">{description}</p>}
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
