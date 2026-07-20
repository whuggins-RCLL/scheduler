"use client";

import { useCallback, useEffect, useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { hoursLabel } from "@/lib/ui";
import type { EmployeeProfile } from "@/domain/types";
import {
  disconnectCalendar,
  fetchCalendarReadiness,
  startCalendarConnect,
  syncMyCalendar,
  type CalendarReadiness,
} from "@/lib/integrations/calendar-client";

function humanize(s: string): string {
  return s.replace(/_/g, " ").replace(/(^|\s)\S/g, (m) => m.toUpperCase());
}

type Note = { kind: "ok" | "err" | "info"; text: string } | null;

function GoogleCalendarSettings({ profile }: { profile: EmployeeProfile }) {
  const { db, currentUser } = useStore();
  const [readiness, setReadiness] = useState<CalendarReadiness | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);

  const runSync = useCallback(async () => {
    setBusy(true);
    try {
      const result = await syncMyCalendar(currentUser.id, {
        shifts: db.shifts,
        schedules: db.schedules,
        positions: db.positions,
        locations: db.locations,
        tasks: db.tasks,
      });
      if (result.ok) {
        setNote({ kind: "ok", text: `Synced ${result.upserted} shift${result.upserted === 1 ? "" : "s"} to your Google Calendar.` });
      } else if (result.reason === "not_connected") {
        setNote({ kind: "info", text: "Connect your Google Calendar first." });
      } else if (result.reason === "not_configured") {
        setNote({ kind: "info", text: "Calendar sync isn't finished being set up by an administrator yet." });
      } else {
        setNote({ kind: "err", text: "Couldn't sync right now. Please try again." });
      }
    } finally {
      setBusy(false);
    }
  }, [currentUser.id, db.shifts, db.schedules, db.positions, db.locations, db.tasks]);

  useEffect(() => {
    void fetchCalendarReadiness().then(setReadiness).catch(() => setReadiness(null));
  }, []);

  // Surface the OAuth round-trip result (?calendar=connected|error) and kick an
  // initial sync so existing shifts populate right after connecting.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("calendar");
    if (!status) return;
    params.delete("calendar");
    const rest = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
    if (status === "connected") {
      setNote({ kind: "ok", text: "Google Calendar connected. Syncing your shifts…" });
      void runSync();
    } else if (status === "error") {
      setNote({ kind: "err", text: "Google Calendar connection failed. Please try again." });
    }
  }, [runSync]);

  async function onConnect() {
    setBusy(true);
    setNote(null);
    const result = await startCalendarConnect();
    if (!result.ok) {
      setBusy(false);
      if (result.reason === "unauthenticated") {
        setNote({ kind: "err", text: "Sign in with Google before connecting your calendar." });
      } else if (result.reason === "not_configured") {
        setNote({ kind: "info", text: "An administrator still needs to finish the one-time Google setup for the library." });
      } else {
        setNote({ kind: "err", text: "Couldn't start the connection. Please try again." });
      }
    }
    // On success the browser redirects to Google, so no further UI update here.
  }

  async function onDisconnect() {
    setBusy(true);
    setNote(null);
    const ok = await disconnectCalendar();
    setBusy(false);
    setNote(
      ok
        ? { kind: "ok", text: "Disconnected. Shifts previously added by the scheduler will stop updating." }
        : { kind: "err", text: "Couldn't disconnect right now. Please try again." },
    );
  }

  const connected = profile.googleCalendarConnected;
  const notReady = readiness !== null && !readiness.ready;

  return (
    <section className="card" aria-labelledby="calendar">
      <h2 id="calendar">Google Calendar</h2>
      <div className="spread">
        <div className="row" style={{ alignItems: "center", gap: "0.5rem" }}>
          {connected ? <span className="badge ok">Connected</span> : <span className="badge">Not connected</span>}
          <span className="muted">
            {connected
              ? "Your published shifts sync to your personal Google Calendar."
              : "Connect to add your published shifts to your personal Google Calendar."}
          </span>
        </div>
        <div className="row">
          {connected ? (
            <>
              <button type="button" className="button sm" onClick={() => void runSync()} disabled={busy}>
                {busy ? "Working…" : "Sync now"}
              </button>
              <button type="button" className="button sm danger" onClick={() => void onDisconnect()} disabled={busy}>
                Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              className="button sm primary"
              onClick={() => void onConnect()}
              disabled={busy || notReady}
              aria-describedby={notReady ? "calendar-note" : undefined}
            >
              {busy ? "Working…" : "Connect"}
            </button>
          )}
        </div>
      </div>

      {note && (
        <p role="status" className={`badge ${note.kind === "info" ? "info" : note.kind}`} style={{ marginTop: "0.6rem", whiteSpace: "normal" }}>
          {note.text}
        </p>
      )}

      {notReady && (
        <p id="calendar-note" className="hint mt" role="note">
          Personal calendar sync activates once an administrator completes the one-time Google connection for the
          library{readiness && readiness.missing.length ? ` (pending: ${readiness.missing.join(", ")})` : ""}. The
          shared library calendar and your in-app schedule work in the meantime.
        </p>
      )}
    </section>
  );
}

export function SettingsView() {
  const { db, currentUser } = useStore();
  const profile = db.employees.find((e) => e.id === currentUser.id);

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Settings</h1>
        <p className="muted">Your profile, calendar connection, and notification preferences.</p>
      </div>

      {!profile ? (
        <div className="empty-state">
          No employee profile is linked to this account. Administrator accounts without a staff profile
          have nothing to configure here.
        </div>
      ) : (
        <>
          <section className="card" aria-labelledby="profile">
            <h2 id="profile">Profile</h2>
            <dl className="grid-2">
              <div className="field">
                <dt className="hint">Name</dt>
                <dd style={{ margin: 0 }}>{profile.preferredName ?? profile.legalName}</dd>
              </div>
              <div className="field">
                <dt className="hint">Email</dt>
                <dd style={{ margin: 0 }}>{profile.email}</dd>
              </div>
              <div className="field">
                <dt className="hint">Classification</dt>
                <dd style={{ margin: 0 }}>{humanize(profile.classification)}</dd>
              </div>
              <div className="field">
                <dt className="hint">Target weekly hours</dt>
                <dd style={{ margin: 0 }}>{hoursLabel(profile.targetWeeklyHours * 60)}</dd>
              </div>
            </dl>
          </section>

          <GoogleCalendarSettings profile={profile} />

          <section className="card" aria-labelledby="notifications">
            <h2 id="notifications">Notification preferences</h2>
            <p className="muted">These are read-only here; changes are managed by an administrator.</p>
            <div className="row">
              <span className={`badge ${profile.notificationPrefs.inApp ? "ok" : ""}`}>
                In-app: {profile.notificationPrefs.inApp ? "On" : "Off"}
              </span>
              <span className={`badge ${profile.notificationPrefs.email ? "ok" : ""}`}>
                Email: {profile.notificationPrefs.email ? "On" : "Off"}
              </span>
              <span className={`badge ${profile.notificationPrefs.calendar ? "ok" : ""}`}>
                Calendar: {profile.notificationPrefs.calendar ? "On" : "Off"}
              </span>
              <span className={`badge ${profile.notificationPrefs.digest ? "ok" : ""}`}>
                Daily digest: {profile.notificationPrefs.digest ? "On" : "Off"}
              </span>
            </div>
          </section>
        </>
      )}

      <section className="card" aria-labelledby="theme">
        <h2 id="theme">Theme &amp; accessibility</h2>
        <p className="muted">
          Theme and reduce-transparency controls live in the top bar of every page. Use them to switch
          between light and dark appearance and to reduce visual effects for readability.
        </p>
      </section>
    </div>
  );
}
