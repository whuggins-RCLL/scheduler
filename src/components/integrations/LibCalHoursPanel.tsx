import { LIBCAL_HOURS_URL } from "@/lib/integrations/hours";

export function LibCalHoursPanel() {
  return (
    <section className="card" aria-labelledby="libcal-hours-heading">
      <p className="status">Connected provider draft</p>
      <h2 id="libcal-hours-heading">LibCal operating hours</h2>
      <p>
        Cardinal Shift is configured to normalize the Stanford Law Library LibCal JSON-LD hours feed for
        location <strong>2457</strong>. Managers can use this source for comparison and synchronization once
        Firestore persistence is enabled.
      </p>
      <dl>
        <dt>Provider</dt>
        <dd>LibCalHoursProvider</dd>
        <dt>Feed URL</dt>
        <dd><code>{LIBCAL_HOURS_URL}</code></dd>
        <dt>Normalized API</dt>
        <dd><code>/api/integrations/libcal/hours</code></dd>
      </dl>
      <p className="muted">
        The API returns graceful disconnected-state warnings instead of silently failing when LibCal is unavailable.
      </p>
    </section>
  );
}
