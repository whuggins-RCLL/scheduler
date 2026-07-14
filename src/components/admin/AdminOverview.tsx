"use client";

import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/config";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";

export function AdminOverview() {
  const { db, currentUser, loadSampleData } = useStore();

  if (!canManage(currentUser)) {
    return <div className="empty-state">You do not have access to this section.</div>;
  }

  const sampleLoaded = db.employees.some((e) => e.id === "emp-sample-riley");

  const cards: { href: string; label: string; metric: string; hint: string }[] = [
    { href: "/admin/users", label: "Users", metric: String(db.users.length), hint: "Accounts and roles" },
    { href: "/admin/preview", label: "View previews", metric: "2", hint: "Student and staff experiences" },
    { href: "/admin/roles", label: "Roles", metric: "6", hint: "Access model reference" },
    {
      href: "/admin/organization",
      label: "Organization",
      metric: String(db.departments.length + db.teams.length),
      hint: "Departments and teams",
    },
    {
      href: "/admin/locations",
      label: "Locations",
      metric: String(db.locations.filter((l) => l.active).length),
      hint: "Active locations",
    },
    { href: "/admin/hours", label: "Operating hours", metric: String(db.operatingHours.length), hint: "Weekly schedules" },
    {
      href: "/admin/positions",
      label: "Positions",
      metric: String(db.positions.filter((p) => p.active).length),
      hint: "Active positions",
    },
    {
      href: "/admin/tasks",
      label: "Tasks",
      metric: String(db.tasks.filter((t) => t.active).length),
      hint: "Active tasks",
    },
    {
      href: "/admin/qualifications",
      label: "Qualifications",
      metric: String(db.positions.length),
      hint: "Position requirements",
    },
    {
      href: "/admin/compliance",
      label: "Compliance",
      metric: String(db.breakPolicies.length),
      hint: "Break policies",
    },
    { href: "/admin/integrations", label: "Integrations", metric: "3", hint: "Google, LibCal, Firebase" },
    { href: "/admin/audit", label: "Audit log", metric: String(db.audit.length), hint: "Recorded events" },
  ];

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Admin portal</h1>
        <p className="muted">
          Configuration and oversight for {PRODUCT_NAME}. Most sections are read-only reference; edits are
          performed through dedicated manager workflows.
        </p>
      </div>

      <section className="card glass spread" aria-labelledby="sample-data">
        <div>
          <h2 id="sample-data" style={{ margin: 0 }}>Sample schedule &amp; staff</h2>
          <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.9rem" }}>
            {sampleLoaded
              ? "Sample staff, positions, and a published week of shifts are loaded. Use “View as” in the top bar to sample the student and staff experience."
              : "Load a demo dataset — sample staff, positions, and a published week of shifts — so you can explore the full experience without live data."}
          </p>
        </div>
        <button
          className="button primary glass-button"
          onClick={loadSampleData}
          disabled={sampleLoaded}
          aria-disabled={sampleLoaded}
        >
          {sampleLoaded ? "Sample loaded ✓" : "Load sample schedule"}
        </button>
      </section>

      <div className="grid">
        {cards.map((c) => (
          <Link key={c.href} className="card card-link" href={c.href}>
            <div className="metric">{c.metric}</div>
            <div className="metric-label">{c.label}</div>
            <p className="muted mt">{c.hint}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
