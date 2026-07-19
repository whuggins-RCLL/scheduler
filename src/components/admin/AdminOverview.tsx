"use client";

import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/config";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage, hasRole, isAdmin } from "@/domain/scope";
import type { Database } from "@/lib/store/types";

/** Who may open a given admin section. */
type Access = "manage" | "admin" | "audit";

interface AdminCard {
  href: string;
  icon: string;
  label: string;
  /** Live count shown as a badge; hidden when omitted. */
  metric?: (db: Database) => string;
  /** What an administrator can actually do in this section. */
  caption: string;
  access: Access;
}

interface AdminSection {
  id: string;
  title: string;
  description: string;
  cards: AdminCard[];
}

const SECTIONS: AdminSection[] = [
  {
    id: "people",
    title: "People & access",
    description: "Who can sign in, what they can do, and how the workforce is organized.",
    cards: [
      {
        href: "/admin/users",
        icon: "👥",
        label: "Users",
        metric: (db) => `${db.users.length}`,
        caption: "Approve new sign-ins, assign roles, and complete staff onboarding.",
        access: "admin",
      },
      {
        href: "/admin/roles",
        icon: "🔑",
        label: "Roles",
        metric: () => "6",
        caption: "Review the access model — what each role can see and do.",
        access: "admin",
      },
      {
        href: "/admin/organization",
        icon: "🏛️",
        label: "Organization",
        metric: (db) => `${db.departments.length + db.teams.length}`,
        caption: "Manage the departments and teams used for scheduling scope.",
        access: "manage",
      },
      {
        href: "/admin/schedule-access",
        icon: "🧩",
        label: "Schedule access",
        metric: (db) => `${db.locations.filter((l) => l.active).length}`,
        caption: "Set which schedule types each employee can be scheduled on.",
        access: "manage",
      },
      {
        href: "/admin/preview",
        icon: "👁️",
        label: "View previews",
        metric: () => "2",
        caption: "See the site exactly as a student or staff member experiences it.",
        access: "manage",
      },
    ],
  },
  {
    id: "availability",
    title: "Availability & scheduling",
    description: "Control when people submit availability and what the scheduling engine can assign.",
    cards: [
      {
        href: "/admin/student-availability",
        icon: "🗓️",
        label: "Student availability",
        metric: (db) => `${db.studentAvailabilityWindows.length}`,
        caption: "Open and lock student sign-up windows, then approve the hours to schedule.",
        access: "manage",
      },
      {
        href: "/admin/global-exceptions",
        icon: "🎓",
        label: "Global exceptions",
        metric: (db) => `${db.globalExceptions.length}`,
        caption: "Post university holidays and closures to everyone's exceptions automatically.",
        access: "manage",
      },
      {
        href: "/admin/positions",
        icon: "🪑",
        label: "Positions",
        metric: (db) => `${db.positions.filter((p) => p.active).length}`,
        caption: "Create and edit the desk posts and coverage roles the scheduler fills.",
        access: "manage",
      },
      {
        href: "/admin/tasks",
        icon: "✅",
        label: "Tasks",
        metric: (db) => `${db.tasks.filter((t) => t.active).length}`,
        caption: "Define recurring tasks, checklists, and open/close dependencies.",
        access: "manage",
      },
      {
        href: "/admin/task-qualifications",
        icon: "✔️",
        label: "Task qualifications",
        metric: (db) => `${db.tasks.filter((t) => t.active).length}`,
        caption: "Match employees to the tasks they are qualified to perform.",
        access: "manage",
      },
      {
        href: "/admin/qualifications",
        icon: "🎯",
        label: "Qualifications",
        metric: (db) => `${db.positions.length}`,
        caption: "Set the skills a position requires before someone can be assigned to it.",
        access: "manage",
      },
    ],
  },
  {
    id: "locations",
    title: "Locations & hours",
    description: "Where work happens, when the doors are open, and the systems that feed it.",
    cards: [
      {
        href: "/admin/locations",
        icon: "🗂️",
        label: "Schedule types",
        metric: (db) => `${db.locations.filter((l) => l.active).length}`,
        caption: "Add and manage schedule boards — desk, stacks, breaks, special events.",
        access: "manage",
      },
      {
        href: "/admin/hours",
        icon: "🕘",
        label: "Operating hours",
        metric: (db) => `${db.operatingHours.length}`,
        caption: "Set weekly open hours and one-off exceptions for each location.",
        access: "manage",
      },
      {
        href: "/admin/integrations",
        icon: "🔌",
        label: "Integrations",
        metric: () => "3",
        caption: "Connect Google, LibCal hours, and Firebase, and check connection status.",
        access: "manage",
      },
    ],
  },
  {
    id: "oversight",
    title: "Compliance & oversight",
    description: "The guardrails the engine enforces and the record of everything that changes.",
    cards: [
      {
        href: "/admin/compliance",
        icon: "⚖️",
        label: "Compliance",
        metric: (db) => `${db.breakPolicies.length}`,
        caption: "Tune the California meal and rest-break policies the engine enforces.",
        access: "manage",
      },
      {
        href: "/admin/audit",
        icon: "📜",
        label: "Audit log",
        metric: (db) => `${db.audit.length}`,
        caption: "Trace every change — who did what, when, and exactly what changed.",
        access: "audit",
      },
    ],
  },
];

export function AdminOverview() {
  const { db, currentUser, loadSampleData } = useStore();

  if (!canManage(currentUser)) {
    return <div className="empty-state">You do not have access to this section.</div>;
  }

  const admin = isAdmin(currentUser);
  const canSee = (access: Access): boolean => {
    if (access === "manage") return true; // page is already gated by canManage
    if (access === "admin") return admin;
    return admin || hasRole(currentUser, "AUDITOR"); // audit
  };

  const sampleLoaded = db.employees.some((e) => e.id === "emp-sample-riley");
  // Active tasks with no schedule-type mapping are hidden from every board until
  // an admin places them, so surface the count as a call to action.
  const unmappedTasks = db.tasks.filter((t) => t.active && t.applicableLocationIds.length === 0).length;
  const visibleSections = SECTIONS.map((section) => ({
    ...section,
    cards: section.cards.filter((c) => canSee(c.access)),
  })).filter((section) => section.cards.length > 0);

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Admin dashboard</h1>
        <p className="muted">
          Everything you need to configure and oversee {PRODUCT_NAME}, in one place. Pick a section below —
          each card explains what you can do there.
        </p>
      </div>

      <Link href="/admin/map" className="card card-link admin-feature" aria-label="Open the schedule map">
        <span className="admin-feature-icon" aria-hidden>🗺️</span>
        <div className="admin-feature-body">
          <div className="admin-feature-title">
            Schedule map
            <span className="badge info">{db.locations.filter((l) => l.active).length + db.positions.filter((p) => p.active).length + db.tasks.filter((t) => t.active).length} items</span>
            {unmappedTasks > 0 && (
              <span className="badge warn">
                {unmappedTasks} task{unmappedTasks === 1 ? " needs" : "s need"} placing
              </span>
            )}
          </div>
          <p className="muted admin-feature-caption">
            An interactive map of the whole scheduling setup — see and edit how schedule types, positions, and
            tasks connect, how much coverage each generates, and where staffing gaps are. Changes sync with every
            settings screen.
            {unmappedTasks > 0 && (
              <>
                {" "}
                <strong>
                  {unmappedTasks} active task{unmappedTasks === 1 ? " is" : "s are"} not mapped to any schedule type
                </strong>{" "}
                and {unmappedTasks === 1 ? "stays" : "stay"} hidden from the boards until you place{" "}
                {unmappedTasks === 1 ? "it" : "them"}.
              </>
            )}
          </p>
        </div>
        <span className="admin-feature-cta" aria-hidden>Open map →</span>
      </Link>

      <section className="card glass admin-sample" aria-labelledby="sample-data">
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

      {visibleSections.map((section) => (
        <section key={section.id} className="admin-section" aria-labelledby={`admin-section-${section.id}`}>
          <div className="admin-section-head">
            <h2 id={`admin-section-${section.id}`}>{section.title}</h2>
            <p className="muted">{section.description}</p>
          </div>
          <div className="grid">
            {section.cards.map((card) => (
              <Link key={card.href} className="card card-link admin-card" href={card.href}>
                <div className="admin-card-top">
                  <span className="admin-card-icon" aria-hidden>{card.icon}</span>
                  {card.metric && <span className="badge info admin-card-metric">{card.metric(db)}</span>}
                </div>
                <div className="admin-card-title">
                  {card.label}
                  {card.access !== "manage" && <span className="badge admin-card-tag">Admin only</span>}
                </div>
                <p className="muted admin-card-caption">{card.caption}</p>
                <span className="admin-card-cta" aria-hidden>Open →</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
