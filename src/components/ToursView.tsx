"use client";

import Link from "next/link";
import { useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";

type TourStep = { title: string; body: string; href: string; cta: string };

const staffTour: TourStep[] = [
  { title: "Check your home base", body: "Start on the dashboard for your next shift, notifications, swaps, and exception count.", href: "/dashboard", cta: "Open dashboard" },
  { title: "Review the published schedule", body: "Use schedule views to see when you work, where you are assigned, and any shift tasks.", href: "/schedule", cta: "View schedule" },
  { title: "Keep availability current", body: "Update recurring availability and add one-off unavailable exceptions without submitting an approval request.", href: "/availability", cta: "Edit availability" },
  { title: "Handle changes", body: "Offer, request, or review shift swaps from the marketplace when plans change.", href: "/swaps", cta: "Open swaps" },
  { title: "Connect reminders", body: "Confirm notifications and calendar sync so published shifts show up where you already plan your week.", href: "/settings", cta: "Open settings" },
];

const managerTour: TourStep[] = [
  { title: "Preview staff experience", body: "Review student and staff views before rolling out policy, schedule, or navigation changes.", href: "/admin/preview", cta: "Open previews" },
  { title: "Confirm people and roles", body: "Invite users, activate accounts, and scope manager or scheduler roles from the admin portal.", href: "/admin/users", cta: "Manage users" },
  { title: "Enter availability exceptions", body: "Open an employee's availability record and add exceptions directly—no leave approval queue required.", href: "/availability", cta: "Open availability" },
  { title: "Generate and publish", body: "Use the schedule workspace to create coverage, resolve compliance findings, and publish shifts.", href: "/schedule", cta: "Open scheduler" },
  { title: "Monitor operations", body: "Use reports, audit logs, integrations, and compliance settings to keep the schedule healthy.", href: "/admin", cta: "Open admin" },
];

export function ToursView() {
  const { currentUser } = useStore();
  const manager = canManage(currentUser);
  const [tour, setTour] = useState<"staff" | "manager">(manager ? "manager" : "staff");
  const steps = tour === "staff" ? staffTour : managerTour;

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Guided tours</h1>
        <p className="muted">Choose the quick-start path that matches how someone will use Cardinal Shift.</p>
      </div>

      <div className="pill-toggle" aria-label="Tour audience">
        <button aria-pressed={tour === "staff"} onClick={() => setTour("staff")}>Students &amp; staff</button>
        <button aria-pressed={tour === "manager"} onClick={() => setTour("manager")}>Admins &amp; managers</button>
      </div>

      <section className="card pad-lg">
        <div className="spread">
          <div>
            <h2>{tour === "staff" ? "Student and staff tour" : "Admin and manager onboarding tour"}</h2>
            <p className="muted">{tour === "staff" ? "A self-service walkthrough for everyday scheduling tasks." : "A rollout checklist for configuring, previewing, and publishing schedules."}</p>
          </div>
          <span className="badge info">{steps.length} steps</span>
        </div>
        <ol className="tour-list">
          {steps.map((step, index) => (
            <li key={step.title} className="tour-step">
              <span className="tour-number" aria-hidden>{index + 1}</span>
              <div>
                <h3>{step.title}</h3>
                <p className="muted">{step.body}</p>
                <Link href={step.href} className="button sm">{step.cta}</Link>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
