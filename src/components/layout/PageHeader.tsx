import type { ReactNode } from "react";

interface PageHeaderProps {
  /** Mono uppercase label above the title (e.g. "Compras", "Stock"). */
  eyebrow?: string;
  title: string;
  /** Muted line under the title — usually a real count or short description. */
  subtitle?: ReactNode;
  /** Right-aligned actions (buttons). */
  actions?: ReactNode;
}

/**
 * High-End Soft page header: eyebrow (mono) + display H1 + muted subtitle,
 * with optional right-aligned actions. Matches the Dashboard / Inventario pattern.
 */
export function PageHeader({ eyebrow, title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}
