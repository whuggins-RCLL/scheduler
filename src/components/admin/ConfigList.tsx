"use client";

import type { ReactNode } from "react";

export interface ConfigListColumn {
  key: string;
  label: string;
}

export interface ConfigListProps {
  title: string;
  description?: string;
  columns: ConfigListColumn[];
  rows: Record<string, ReactNode>[];
  empty?: string;
}

/** Small reusable read-only table with a page head. */
export function ConfigList({ title, description, columns, rows, empty }: ConfigListProps) {
  return (
    <div className="stack">
      <div className="page-head">
        <h1>{title}</h1>
        {description ? <p className="muted">{description}</p> : null}
      </div>
      {rows.length === 0 ? (
        <div className="empty-state">{empty ?? "Nothing to show yet."}</div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <caption>{title}</caption>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} scope="col">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key}>{row[c.key] ?? "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
