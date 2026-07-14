"use client";

import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";
import { LibCalHoursPanel } from "@/components/integrations/LibCalHoursPanel";

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
          <li>
            <code>GOOGLE_OAUTH_CLIENT_ID</code>
          </li>
          <li>
            <code>GOOGLE_OAUTH_CLIENT_SECRET</code>
          </li>
        </ul>
        <div className="mt">
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
          overwritten by a synced source.
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
