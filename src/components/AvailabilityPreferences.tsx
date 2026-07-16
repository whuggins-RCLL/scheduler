"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { firstName } from "@/lib/ui";
import { getTimeFormat, setTimeFormat, type TimeFormat } from "@/lib/time-format";

export function AvailabilityPreferences() {
  const { db, currentUser, saveEmployeeProfile } = useStore();
  const profile = db.employees.find((e) => e.id === currentUser.id);
  const defaultName = profile
    ? firstName(profile.preferredName ?? profile.legalName)
    : firstName(currentUser.displayName);

  const [preferredName, setPreferredName] = useState(defaultName);
  const [timeFormat, setTimeFormatState] = useState<TimeFormat>("standard");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setTimeFormatState(getTimeFormat());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!profile) return;
    setPreferredName(profile.preferredName ?? firstName(profile.legalName));
    setSaved(false);
    setSaveError(null);
  }, [profile]);

  function handleTimeFormatChange(format: TimeFormat) {
    setTimeFormatState(format);
    setTimeFormat(format);
    setSaved(false);
  }

  async function save() {
    if (!profile) return;
    const trimmed = preferredName.trim();
    if (!trimmed) {
      setSaveError("Preferred name cannot be empty.");
      setSaved(false);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await saveEmployeeProfile({ ...profile, preferredName: trimmed });
      setSaved(true);
    } catch (error) {
      setSaved(false);
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  if (!profile) return null;

  return (
    <section className="card" aria-labelledby="availability-prefs-heading">
      <h2 id="availability-prefs-heading">Your preferences</h2>
      <p className="muted" style={{ fontSize: "0.88rem" }}>
        How you appear across the site and how times are displayed.
      </p>

      <div className="grid-2" style={{ marginTop: "1rem" }}>
        <div className="field">
          <label htmlFor="preferred-name">Preferred name</label>
          <input
            id="preferred-name"
            type="text"
            value={preferredName}
            onChange={(e) => { setPreferredName(e.target.value); setSaved(false); }}
            placeholder={firstName(profile.legalName)}
            autoComplete="nickname"
          />
          <span className="hint">Shown in greetings, schedules, and team views.</span>
        </div>

        <fieldset className="field" style={{ border: "none", padding: 0, margin: 0 }}>
          <legend className="hint" style={{ marginBottom: "0.35rem" }}>Time display</legend>
          <div className="pill-toggle" role="group" aria-label="Time format">
            <button
              type="button"
              aria-pressed={timeFormat === "standard"}
              onClick={() => handleTimeFormatChange("standard")}
              disabled={!loaded}
            >
              Standard (9:00 AM)
            </button>
            <button
              type="button"
              aria-pressed={timeFormat === "military"}
              onClick={() => handleTimeFormatChange("military")}
              disabled={!loaded}
            >
              Military (09:00)
            </button>
          </div>
          <span className="hint">Applies to shift times and schedules throughout the site.</span>
        </fieldset>
      </div>

      <div className="row mt">
        <button className="button primary" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save preferences"}
        </button>
        {saved && <span role="status" className="badge ok">Saved</span>}
        {saveError && <span role="alert" className="badge err">{saveError}</span>}
      </div>
    </section>
  );
}
