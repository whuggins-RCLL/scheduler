"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage, isStudentWorker } from "@/domain/scope";
import { resolveEmployeeProfile } from "@/domain/employee-profile";
import { PRODUCT_NAME } from "@/lib/config";

type Audience = "student" | "staff" | "manager";

/** A single numbered step in a walkthrough. */
type Step = { title: string; body: ReactNode };

/** One jump-to entry in the table of contents. */
const SECTIONS: { id: string; label: string; icon: string }[] = [
  { id: "how-it-works", label: "How it works", icon: "🧭" },
  { id: "students", label: "Students", icon: "🎓" },
  { id: "library-staff", label: "Library staff", icon: "📚" },
  { id: "managers", label: "Managers & admins", icon: "🛠️" },
  { id: "google-calendar", label: "Google Calendar", icon: "📅" },
];

/** The end-to-end lifecycle, explained in four plain-language beats. */
const FLOW: { icon: string; title: string; body: string }[] = [
  {
    icon: "📝",
    title: "1 · Everyone shares availability",
    body: "Students sign up for the hours they can work. Library staff set their regular working hours and desk windows. This is the raw material the schedule is built from.",
  },
  {
    icon: "🧩",
    title: "2 · Managers build the schedule",
    body: "A manager turns everyone's availability into real shifts, making sure the service desk is always covered and that the hours follow the rules.",
  },
  {
    icon: "📣",
    title: "3 · The schedule is published",
    body: "Once it looks right, the manager publishes it. Publishing locks it in and notifies the people who are assigned to shifts.",
  },
  {
    icon: "✅",
    title: "4 · You see your shifts",
    body: "Your shifts show up on your dashboard and schedule — and, once connected, on your own Google Calendar. Plans change? Offer or pick up a swap.",
  },
];

/** Key words you'll see across the app, kept to one sentence each. */
const GLOSSARY: { term: string; def: string }[] = [
  { term: "Availability", def: "The hours you tell us you can (or prefer to) work. The schedule is only ever built from this." },
  { term: "Exception", def: "A one-off change to your usual availability — a day you can't work, an appointment, or time off." },
  { term: "Shift", def: "A specific block of assigned work: a time, a place, and what you'll be doing." },
  { term: "Coverage", def: "Making sure enough qualified people are scheduled at the service desk for every open hour." },
  { term: "Swap", def: "Handing off a shift you can't work, or picking up one someone else has offered." },
  { term: "Published", def: "A finished, official schedule. Draft schedules are works-in-progress; published ones are the real thing." },
];

const STUDENT_STEPS: Step[] = [
  {
    title: "Open Availability & Exceptions",
    body: <>In the left menu, choose <strong>Availability &amp; Exceptions</strong>. This is your home for telling us when you can work.</>,
  },
  {
    title: "Check that the submission window is open",
    body: <>Students sign up during a set window each scheduling period. The page shows whether it&apos;s open and when it closes. If it&apos;s closed, your manager can still make changes for you.</>,
  },
  {
    title: "Click the hours you can work",
    body: <>Tap a time slot to cycle it through <strong>Unavailable → Available → Preferred</strong>. Mark everything you could work as <em>Available</em>, and the times you&apos;d most like as <em>Preferred</em> — that helps you get the shifts you want.</>,
  },
  {
    title: "Stay under your weekly hour cap",
    body: <>There&apos;s a limit on how many hours you can sign up for each week. A running total keeps you on track as you go.</>,
  },
  {
    title: "Save — then your manager approves a subset",
    body: <>Signing up doesn&apos;t schedule you automatically. Your manager approves a portion of your hours, and those approved hours are what the schedule is built from.</>,
  },
  {
    title: "Need a specific day off later?",
    body: <>Ask your manager to log an <strong>exception</strong> for you. Students don&apos;t record their own exceptions — this keeps approved hours accurate.</>,
  },
];

const STAFF_STEPS: Step[] = [
  {
    title: "Open Availability & Exceptions",
    body: <>Choose <strong>Availability &amp; Exceptions</strong> from the left menu. Complete it top to bottom the first time.</>,
  },
  {
    title: "Set your regular working hours first",
    body: <>Start with your <strong>working hours</strong>: which days you work, your start and end times, whether you&apos;re on-site or remote, and the dates the pattern applies. This is your baseline week.</>,
  },
  {
    title: "Add your desk-coverage windows",
    body: <>Below that, mark the times you&apos;re <strong>Available</strong> or <strong>Preferred</strong> for service-desk coverage (and anything that&apos;s a hard <em>Unavailable</em>). This is what the scheduler uses to place you at the desk.</>,
  },
  {
    title: "Set your meal break",
    body: <>Pick your meal-break length so the scheduler builds a compliant day and never books over your break.</>,
  },
  {
    title: "Log one-off exceptions any time",
    body: <>Can&apos;t work a particular day? Add an <strong>exception</strong> yourself — no approval queue, no waiting. Do it as far ahead as you can so the schedule stays accurate.</>,
  },
  {
    title: "Save and you're set",
    body: <>Your availability feeds straight into the next schedule. Update it whenever your routine changes.</>,
  },
];

const MANAGER_STEPS: Step[] = [
  {
    title: "Set people up",
    body: <>Approve new sign-ins and assign roles in <Link href="/admin/users">User management</Link>. Roles decide what each person can see and do.</>,
  },
  {
    title: "Open the student sign-up window & approve hours",
    body: <>Manage the student submission window in <Link href="/admin/student-availability">Student availability</Link>, then approve the hours each student can actually be scheduled for.</>,
  },
  {
    title: "Log exceptions on behalf of staff",
    body: <>Someone called out or booked leave? Open their record in <Link href="/availability">Availability</Link> and add the exception directly — it flows into the schedule immediately.</>,
  },
  {
    title: "Build and publish the schedule",
    body: <>In the <Link href="/schedule">Schedule workspace</Link>, generate coverage from everyone&apos;s availability, resolve any compliance findings the system flags, then publish. Publishing notifies assigned staff.</>,
  },
  {
    title: "Keep the guardrails current",
    body: <>From the <Link href="/admin">Admin dashboard</Link>, maintain positions, qualifications, operating hours, holidays and global exceptions, integrations, and compliance rules. These keep every generated schedule legal and correctly staffed.</>,
  },
  {
    title: "Preview and audit",
    body: <>Use <Link href="/admin/preview">Preview</Link> to sample exactly what students and staff see, and the audit log to review every change. Nothing is ever silently deleted.</>,
  },
];

const CALENDAR_STEPS: Step[] = [
  {
    title: "See the shared library calendar",
    body: <>Open <Link href="/calendar">Calendar</Link> for the library&apos;s shared operations calendar — team-wide events and upcoming happenings everyone can see.</>,
  },
  {
    title: "Connect your personal Google Calendar",
    body: <>Go to <Link href="/settings">Settings → Google Calendar</Link> and choose <strong>Connect</strong>. This is a one-time, per-person link between your account and your own Google Calendar.</>,
  },
  {
    title: "Your published shifts sync automatically",
    body: <>Once connected, every shift you&apos;re assigned lands on your Google Calendar with its time, location, and tasks — and updates if the schedule changes. No copying and pasting.</>,
  },
];

function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="guide-steps">
      {steps.map((step, i) => (
        <li key={step.title} className="guide-step">
          <span className="guide-step-num" aria-hidden>{i + 1}</span>
          <div className="guide-step-body">
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function SectionHead({
  id,
  eyebrow,
  title,
  intro,
  recommended,
}: {
  id: string;
  eyebrow: string;
  title: string;
  intro: ReactNode;
  recommended?: boolean;
}) {
  return (
    <div className="guide-section-head">
      <span className="guide-eyebrow">{eyebrow}</span>
      <div className="guide-section-title">
        <h2 id={id}>{title}</h2>
        {recommended && <span className="badge info guide-foryou">Recommended for you</span>}
      </div>
      <p className="guide-lede">{intro}</p>
    </div>
  );
}

export function GuidesView() {
  const { db, currentUser, viewAs } = useStore();
  const profile = resolveEmployeeProfile(db.employees, currentUser, viewAs);
  const audience: Audience = canManage(currentUser)
    ? "manager"
    : isStudentWorker(profile.classification)
      ? "student"
      : "staff";

  return (
    <div className="stack guide-page">
      <header className="dash-hero guide-hero">
        <p className="eyebrow">Guides &amp; help</p>
        <h1>Everything you need to run your schedule</h1>
        <p className="guide-hero-sub">
          {PRODUCT_NAME} keeps the library&apos;s service desk covered without the endless email threads.
          Here&apos;s how it works, and exactly what to do for your role — in plain language, start to finish.
        </p>
        <nav className="guide-toc" aria-label="Jump to a guide">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="guide-toc-link">
              <span aria-hidden>{s.icon}</span> {s.label}
            </a>
          ))}
        </nav>
      </header>

      {/* -------------------------------------------------- How it works */}
      <section className="card pad-lg guide-section" aria-labelledby="how-it-works">
        <SectionHead
          id="how-it-works"
          eyebrow="Start here"
          title="How the scheduler works"
          intro="If you read one thing, read this. The whole platform is really just four simple steps that repeat every scheduling period."
        />

        <ol className="guide-flow">
          {FLOW.map((f) => (
            <li key={f.title} className="guide-flow-step">
              <span className="guide-flow-icon" aria-hidden>{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </li>
          ))}
        </ol>

        <div className="guide-callout">
          <span className="guide-callout-icon" aria-hidden>💡</span>
          <p>
            <strong>The golden rule:</strong> keep your availability honest and up to date. The schedule is only
            ever built from what people tell us they can work — so accurate availability means a schedule that
            actually fits everyone&apos;s lives.
          </p>
        </div>

        <h3 className="guide-subhead">Words you&apos;ll see</h3>
        <dl className="guide-glossary">
          {GLOSSARY.map((g) => (
            <div key={g.term} className="guide-term">
              <dt>{g.term}</dt>
              <dd>{g.def}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* -------------------------------------------------- Students */}
      <section className="card pad-lg guide-section" aria-labelledby="students">
        <SectionHead
          id="students"
          eyebrow="For students"
          title="Sign up for the hours you can work"
          intro="You tell us when you're free; your manager turns a slice of that into shifts. Here's the whole routine."
          recommended={audience === "student"}
        />
        <StepList steps={STUDENT_STEPS} />
        <div className="guide-callout guide-callout-tip">
          <span className="guide-callout-icon" aria-hidden>🎯</span>
          <p>
            <strong>Want better shifts?</strong> Mark generously as <em>Available</em> and be honest about what&apos;s
            <em> Preferred</em>. The more real availability you give, the more the schedule can work around your classes.
          </p>
        </div>
        <Link href="/availability" className="button primary guide-cta">Go to my availability →</Link>
      </section>

      {/* -------------------------------------------------- Library staff */}
      <section className="card pad-lg guide-section" aria-labelledby="library-staff">
        <SectionHead
          id="library-staff"
          eyebrow="For library staff"
          title="Complete your availability"
          intro="Staff set a regular weekly pattern once, then just keep it current. Work through it top to bottom the first time."
          recommended={audience === "staff"}
        />
        <StepList steps={STAFF_STEPS} />
        <div className="guide-callout guide-callout-tip">
          <span className="guide-callout-icon" aria-hidden>🗓️</span>
          <p>
            <strong>Set it and forget it.</strong> Your working hours carry forward automatically — you only need to
            revisit them when your routine changes. Log exceptions the moment you know about them.
          </p>
        </div>
        <Link href="/availability" className="button primary guide-cta">Complete my availability →</Link>
      </section>

      {/* -------------------------------------------------- Managers & admins */}
      <section className="card pad-lg guide-section" aria-labelledby="managers">
        <SectionHead
          id="managers"
          eyebrow="For managers & admins"
          title="Keep schedules running in the background"
          intro="This is the behind-the-scenes work that turns availability into a covered desk — and keeps every schedule legal and fair."
          recommended={audience === "manager"}
        />
        <StepList steps={MANAGER_STEPS} />
        <div className="guide-callout guide-callout-tip">
          <span className="guide-callout-icon" aria-hidden>🧰</span>
          <p>
            <strong>Let the system do the heavy lifting.</strong> Generate a draft, then focus your attention on the
            compliance findings it surfaces. You&apos;re reviewing and approving — not building every shift by hand.
          </p>
        </div>
        <Link href="/schedule" className="button primary guide-cta">Open the schedule workspace →</Link>
      </section>

      {/* -------------------------------------------------- Google Calendar */}
      <section className="card pad-lg guide-section" aria-labelledby="google-calendar">
        <SectionHead
          id="google-calendar"
          eyebrow="Connect your calendar"
          title="Get your shifts on your Google Calendar"
          intro="Stop checking two places. Link your account so your published shifts show up right alongside the rest of your life."
        />
        <StepList steps={CALENDAR_STEPS} />
        <div className="guide-callout guide-callout-note">
          <span className="guide-callout-icon" aria-hidden>🔌</span>
          <p>
            <strong>Heads up:</strong> personal calendar sync switches on once an administrator completes the one-time
            Google connection for the library. Until then the <em>Connect</em> button will be greyed out — the shared
            library calendar and your in-app schedule work regardless.
          </p>
        </div>
        <div className="guide-cta-row">
          <Link href="/settings" className="button primary guide-cta">Open Settings →</Link>
          <Link href="/calendar" className="button guide-cta">View the library calendar</Link>
        </div>
      </section>

      {/* -------------------------------------------------- Help footer */}
      <section className="card guide-help" aria-label="Get more help">
        <div>
          <h2>Still stuck?</h2>
          <p className="muted">
            Anything the guides don&apos;t cover, your library scheduling admins can help with — from access and roles
            to fixing a shift. Reach out and they&apos;ll sort it.
          </p>
        </div>
        <Link href="/dashboard" className="button">Back to dashboard</Link>
      </section>
    </div>
  );
}
