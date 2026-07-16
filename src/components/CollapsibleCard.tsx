"use client";

import { useId, useState, type ReactNode } from "react";

type CollapsibleCardProps = {
  title: string;
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
  badge?: ReactNode;
};

/** Card section that collapses to a one-line summary to save dashboard space. */
export function CollapsibleCard({
  title,
  summary,
  defaultOpen = false,
  children,
  className = "",
  badge,
}: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section className={`card glass collapsible-card${open ? " is-open" : ""} ${className}`.trim()}>
      <button
        type="button"
        className="collapsible-trigger spread"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <div className="collapsible-trigger-text">
          <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>{title}</h2>
            {badge}
          </div>
          {!open && summary && <div className="collapsible-summary muted">{summary}</div>}
        </div>
        <span className="collapsible-chevron" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <div id={panelId} className="collapsible-body">
          {children}
        </div>
      )}
    </section>
  );
}
