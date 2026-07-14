"use client";

import Link from "next/link";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";
import { LibCalHoursPanel } from "@/components/integrations/LibCalHoursPanel";
import { DESK_COVERAGE_BUFFER_MINUTES } from "@/lib/config";

export function IntegrationsAdmin() {
  const { currentUser } = useStore();

  if (!canManage(currentUser)) {
    return <div className="empty-state">You do not have access to this section.</div>;
  }

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
          <h2 id="google-heading">Google Workspace &amp; Calendar</h2>
          <span className="badge warn">Not configured</span>
        </div>
        <p>
          Planned model: one-way free/busy import from staff calendars plus a one-way publish of assigned
          shifts back to Google Calendar. OAuth setup is required before this can connect.
        </p>
        <p className="muted">Required environment variables:</p>
        <ul className="list-reset stack" style={{ gap: "0.25rem" }}>
          <li><code>GOOGLE_OAUTH_CLIENT_ID</code></li>
          <li><code>GOOGLE_OAUTH_CLIENT_SECRET</code></li>
        </ul>
        <p className="muted mt">
          The shared library operations calendar is already wired for viewing. To pull events into the app,
          add the secret iCal feed as <code>GOOGLE_CALENDAR_ICAL_URL</code> in Vercel (Google Calendar →
          Settings → &ldquo;Secret address in iCal format&rdquo;). It is read server-side and never committed.
        </p>
        <div className="mt row">
          <Link className="button" href="/calendar">Open library calendar</Link>
          <button
            className="button primary"
            disabled
            aria-label="Connect Google Workspace — unavailable until OAuth credentials are configured"
            title="Unavailable until OAuth credentials are configured"
          >
            Connect
          </button>
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
