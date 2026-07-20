"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";
import { LibCalHoursPanel } from "@/components/integrations/LibCalHoursPanel";
import { DESK_COVERAGE_BUFFER_MINUTES } from "@/lib/config";
import { GOOGLE_CALENDAR_CALLBACK_PATH } from "@/lib/integrations/calendar";
import { fetchCalendarReadiness, type CalendarReadiness } from "@/lib/integrations/calendar-client";

export function IntegrationsAdmin() {
  const { currentUser } = useStore();
  const [calendar, setCalendar] = useState<CalendarReadiness | null>(null);
  const [redirectUri, setRedirectUri] = useState("");

  useEffect(() => {
    void fetchCalendarReadiness().then(setCalendar).catch(() => setCalendar(null));
    setRedirectUri(`${window.location.origin}${GOOGLE_CALENDAR_CALLBACK_PATH}`);
  }, []);

  if (!canManage(currentUser)) {
    return <div className="empty-state">You do not have access to this section.</div>;
  }

  const calBadge = !calendar
    ? { cls: "", text: "Checking…" }
    : calendar.ready
      ? { cls: "ok", text: "Ready" }
      : calendar.oauthConfigured || calendar.backendConfigured
        ? { cls: "warn", text: "Setup incomplete" }
        : { cls: "warn", text: "Not configured" };

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Integrations</h1>
        <p className="muted">
          Honest connection state for external services. Nothing below is fabricated as connected — each card
          reflects the current local configuration.
        </p>
      </div>

      <section className="card" aria-labelledby="google-heading">
        <div className="spread">
          <h2 id="google-heading">Personal Google Calendar sync</h2>
          <span className={`badge ${calBadge.cls}`}>{calBadge.text}</span>
        </div>
        <p>
          One-way publish: each person connects their own Google Calendar from <strong>Settings</strong>, and
          their published shifts are written to it (with position, location, tasks, and a link back). The
          integration is fully built — it activates for everyone once the items below are in place. No staff
          calendar data is read.
        </p>

        <p className="muted mt">Complete these once to switch it on:</p>
        <ol className="stack" style={{ gap: "0.35rem", paddingLeft: "1.1rem" }}>
          <li>
            Create an OAuth client in Google Cloud (Calendar API enabled, consent screen set to
            <em> Internal</em>) and register this exact redirect URI:
            <br />
            <code style={{ wordBreak: "break-all" }}>{redirectUri || "…"}</code>
          </li>
          <li>
            Add the client credentials as environment variables in Vercel:
            <ul className="list-reset stack" style={{ gap: "0.2rem", marginTop: "0.25rem" }}>
              <li><code>GOOGLE_OAUTH_CLIENT_ID</code></li>
              <li><code>GOOGLE_OAUTH_CLIENT_SECRET</code></li>
            </ul>
          </li>
          <li>
            Provide Firebase Admin credentials so tokens can be stored server-side
            (<code>FIREBASE_SERVICE_ACCOUNT</code> JSON, or <code>GOOGLE_APPLICATION_CREDENTIALS</code>).
          </li>
        </ol>
        {calendar && !calendar.ready && calendar.missing.length > 0 && (
          <p className="badge warn mt" style={{ whiteSpace: "normal" }}>
            Still missing: {calendar.missing.join(", ")}
          </p>
        )}
        <p className="muted mt">
          Full step-by-step setup lives in <code>docs/integrations.md</code>. Separately, the shared library
          operations calendar is wired for viewing; add the secret iCal feed as
          <code> GOOGLE_CALENDAR_ICAL_URL</code> to list its events in-app.
        </p>
        <div className="mt row">
          <Link className="button" href="/calendar">Open library calendar</Link>
        </div>
      </section>

      <section className="stack">
        <p className="muted">
          Hours use a provider abstraction (Manual / LibCal / Mock). Manager-created exceptions are never
          overwritten by a synced source. Desk coverage automatically extends{" "}
          <strong>{DESK_COVERAGE_BUFFER_MINUTES / 60} hours past</strong> the library&rsquo;s staffed
          closing time (e.g. LibCal close 3:00pm → desk staffed until 5:00pm).
        </p>
        <LibCalHoursPanel />
      </section>

      <section className="card" aria-labelledby="firebase-heading">
        <div className="spread">
          <h2 id="firebase-heading">Firebase</h2>
          <span className="badge info">Local mode</span>
        </div>
        <p>
          The app currently runs against an in-memory store, so every workflow functions without live
          credentials. Production persistence requires the following environment variables:
        </p>
        <ul className="list-reset stack" style={{ gap: "0.25rem" }}>
          <li>
            <code>NEXT_PUBLIC_FIREBASE_API_KEY</code>
          </li>
          <li>
            <code>NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN</code>
          </li>
          <li>
            <code>NEXT_PUBLIC_FIREBASE_PROJECT_ID</code>
          </li>
          <li>
            <code>NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET</code>
          </li>
          <li>
            <code>NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID</code>
          </li>
          <li>
            <code>NEXT_PUBLIC_FIREBASE_APP_ID</code>
          </li>
        </ul>
      </section>
    </div>
  );
}
