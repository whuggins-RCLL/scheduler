"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { summarizeCoverage, type CoverageSummaryRow } from "@/lib/coverage-preview";
import { timeRange } from "@/lib/ui";

/**
 * Manager-facing preview of the coverage requirements "Generate draft" will
 * fill: what the system derived from position/task cadence + operating hours
 * (or the hand-authored coverage, when present), plus any cadence it could not
 * place yet (the skipped notes).
 */
export function CoveragePreview({ scheduleId }: { scheduleId: string }) {
  const { db, previewCoverage } = useStore();
  const [open, setOpen] = useState(false);

  const { summary, skipped, source } = useMemo(() => {
    const resolved = previewCoverage(scheduleId);
    const locationLabel = (id: string) => db.locations.find((l) => l.id === id)?.name ?? id;
    const positionLabel = (id: string) =>
      db.positions.find((p) => p.id === id)?.name ?? db.positions.find((p) => p.id === id)?.shortLabel ?? id;
    const taskLabel = (id: string) => db.tasks.find((t) => t.id === id)?.name ?? id;
    return {
      summary: summarizeCoverage(resolved.requirements, { locationLabel, positionLabel, taskLabel }),
      skipped: resolved.skipped,
      source: resolved.source,
    };
  }, [previewCoverage, scheduleId, db.locations, db.positions, db.tasks]);

  const byLocation = useMemo(() => {
    const map = new Map<string, CoverageSummaryRow[]>();
    for (const row of summary.rows) {
      const list = map.get(row.locationLabel) ?? [];
      list.push(row);
      map.set(row.locationLabel, list);
    }
    return [...map.entries()];
  }, [summary.rows]);

  const empty = summary.totalWindows === 0 && skipped.length === 0;

  return (
    <section className="mt" aria-label="Coverage preview">
      <div className="spread" style={{ alignItems: "baseline", flexWrap: "wrap", gap: "0.4rem" }}>
        <h2 style={{ margin: 0 }}>Coverage templates</h2>
        <span
          className="badge info"
          title={
            source === "derived"
              ? "Derived from position/task frequency and operating hours"
              : source === "merged"
                ? "Hand-authored coverage, with cadence-derived demand merged in for everything not authored"
                : "Coverage was authored by hand for this schedule"
          }
        >
          {source === "derived" ? "Derived from cadence + hours" : source === "merged" ? "Authored + cadence" : "Hand-authored"}
        </span>
      </div>

      {empty ? (
        <p className="muted" style={{ marginBottom: 0 }}>
          No coverage templates yet. Set a frequency on a position or task (Admin → Positions / Tasks),
          or author coverage directly, so &ldquo;Generate draft&rdquo; has something to fill.
        </p>
      ) : (
        <>
          <p className="muted" style={{ margin: "0.15rem 0 0.6rem" }}>
            {summary.totalWindows} coverage window{summary.totalWindows === 1 ? "" : "s"} ·{" "}
            {summary.totalSlots} staffing slot{summary.totalSlots === 1 ? "" : "s"} — what
            &ldquo;Generate draft&rdquo; will try to fill against availability.
          </p>

          {skipped.length > 0 && (
            <div className="card" role="note" style={{ padding: "0.6rem 0.75rem", boxShadow: "none", borderColor: "var(--warn, #b7791f)", marginBottom: "0.6rem" }}>
              <strong style={{ fontSize: "0.9rem" }}>Not scheduled yet ({skipped.length})</strong>
              <ul className="list-reset stack" style={{ gap: "0.2rem", margin: "0.3rem 0 0" }}>
                {skipped.map((note) => (
                  <li key={note} className="muted" style={{ fontSize: "0.85rem" }}>{note}</li>
                ))}
              </ul>
            </div>
          )}

          {summary.rows.length > 0 && (
            <>
              <button
                type="button"
                className="button sm"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
              >
                {open ? "Hide breakdown" : "Show breakdown"}
              </button>

              {open && (
                <div className="mt stack" style={{ gap: "0.75rem" }}>
                  {byLocation.map(([location, rows]) => (
                    <div key={location}>
                      <h3 style={{ margin: "0 0 0.3rem", fontSize: "0.92rem" }}>{location}</h3>
                      <ul className="list-reset stack" style={{ gap: "0.3rem" }}>
                        {rows.map((row) => (
                          <li
                            key={row.key}
                            className="spread"
                            style={{ gap: "0.5rem", flexWrap: "wrap", fontSize: "0.87rem" }}
                          >
                            <span>
                              <span className={`badge ${row.kind === "task" ? "info" : "ok"}`} style={{ marginRight: "0.4rem" }}>
                                {row.kind === "task" ? "Task" : "Post"}
                              </span>
                              {row.label}
                            </span>
                            <span className="muted">
                              {timeRange(row.start, row.end)} · {row.count} needed · {row.days} day{row.days === 1 ? "" : "s"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
