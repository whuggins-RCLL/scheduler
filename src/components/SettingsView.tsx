"use client";

import { useStore } from "@/lib/store/StoreProvider";
import { hoursLabel } from "@/lib/ui";

function humanize(s: string): string {
  return s.replace(/_/g, " ").replace(/(^|\s)\S/g, (m) => m.toUpperCase());
}

export function SettingsView() {
  const { db, currentUser } = useStore();
  const profile = db.employees.find((e) => e.id === currentUser.id);

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Settings</h1>
        <p className="muted">Your profile and notification preferences.</p>
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
