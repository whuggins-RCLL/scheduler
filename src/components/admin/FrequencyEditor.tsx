"use client";

import { FREQUENCY_MODES, defaultFrequency, describeFrequency } from "@/domain/frequency";
import type { FrequencyMode, SchedulingFrequency } from "@/domain/types";

const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

/**
 * Admin editor for a scheduling frequency (cadence). Covers the common cases:
 * "every operational hour" (continuous coverage), N times per day/week, and
 * limiting to specific weekdays (e.g. none on Thursdays = leave Thu unchecked).
 */
export function FrequencyEditor({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: SchedulingFrequency | undefined;
  onChange: (freq: SchedulingFrequency) => void;
}) {
  const freq = value ?? defaultFrequency();

  const setMode = (mode: FrequencyMode) => onChange({ ...freq, mode });
  const setCount = (count: number) => onChange({ ...freq, count: Math.max(1, Math.round(count || 1)) });
  const toggleDay = (day: number, on: boolean) =>
    onChange({
      ...freq,
      weekdays: on
        ? [...new Set([...freq.weekdays, day])].sort()
        : freq.weekdays.filter((d) => d !== day),
    });

  return (
    <fieldset className="freq-editor" style={{ border: "none", padding: 0, margin: 0 }}>
      <legend style={{ fontWeight: 600, fontSize: "0.88rem" }}>Scheduling frequency</legend>
      <p className="hint" style={{ marginTop: 0 }}>How often this needs to be scheduled — used by automated scheduling.</p>

      <div className="row" style={{ gap: "0.6rem", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="field" style={{ flex: "1 1 220px", marginBottom: 0 }}>
          <label htmlFor={`${idPrefix}-mode`}>Cadence</label>
          <select id={`${idPrefix}-mode`} value={freq.mode} onChange={(e) => setMode(e.target.value as FrequencyMode)}>
            {FREQUENCY_MODES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        {freq.mode !== "per_operational_hour" && (
          <div className="field" style={{ flex: "0 1 130px", marginBottom: 0 }}>
            <label htmlFor={`${idPrefix}-count`}>How many</label>
            <input
              id={`${idPrefix}-count`}
              type="number"
              min={1}
              value={freq.count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </div>
        )}
      </div>

      <div style={{ marginTop: "0.6rem" }}>
        <span className="hint">Days it applies (leave all off for every open day)</span>
        <div className="row" style={{ gap: "0.3rem", flexWrap: "wrap", marginTop: "0.3rem" }}>
          {WEEKDAYS.map((d) => {
            const on = freq.weekdays.includes(d.value);
            return (
              <label key={d.value} className={`chip freq-day${on ? " on" : ""}`} style={{ cursor: "pointer", gap: "0.3rem" }}>
                <input
                  type="checkbox"
                  style={{ width: "auto", minHeight: 0 }}
                  checked={on}
                  onChange={(e) => toggleDay(d.value, e.target.checked)}
                  aria-label={d.label}
                />
                {d.label}
              </label>
            );
          })}
        </div>
      </div>

      <p className="muted" style={{ margin: "0.6rem 0 0", fontSize: "0.85rem" }}>
        Summary: <strong>{describeFrequency(freq)}</strong>
      </p>
    </fieldset>
  );
}
