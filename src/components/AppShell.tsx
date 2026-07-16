"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { PRODUCT_NAME, PRODUCT_MARK } from "@/lib/config";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage, isAdmin, primaryRole } from "@/domain/scope";
import { firstName } from "@/lib/ui";
import { ThemeControls } from "./ThemeControls";
import { TimeFormatSync } from "./TimeFormatSync";

const employeeLinks: [string, string][] = [
  ["/dashboard", "Dashboard"],
  ["/schedule", "Schedule"],
  ["/availability", "Availability & Exceptions"],
  ["/swaps", "Swaps"],
  ["/tasks", "Tasks"],
  ["/calendar", "Calendar"],
  ["/tours", "Tours"],
];

const managerLinks: [string, string][] = [
  ["/team", "Team"],
  ["/reports", "Reports"],
];

const adminLinks: [string, string][] = [
  ["/admin", "Overview"],
  ["/admin/global-exceptions", "Global exceptions"],
  ["/admin/student-availability", "Student availability"],
  ["/admin/preview", "View previews"],
  ["/admin/users", "Users"],
  ["/admin/positions", "Positions"],
  ["/admin/tasks", "Tasks"],
  ["/admin/compliance", "Compliance"],
  ["/admin/integrations", "Integrations"],
  ["/admin/audit", "Audit log"],
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, realUser, isAuthenticated, hydrated, signOut, viewAs, setViewAs } = useStore();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (hydrated && !isAuthenticated) router.replace("/login");
  }, [hydrated, isAuthenticated, router]);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.classList.toggle("nav-open", navOpen);
    return () => document.body.classList.remove("nav-open");
  }, [navOpen]);

  if (!hydrated) {
    return <main id="main" style={{ padding: "2rem" }} aria-busy="true"><p className="muted">Loading…</p></main>;
  }
  if (!isAuthenticated) {
    return <main id="main" style={{ padding: "2rem" }}><p className="muted">Redirecting to sign in…</p></main>;
  }

  const manager = canManage(currentUser);
  const admin = isAdmin(currentUser);
  const realAdmin = isAdmin(realUser);
  const viewingAs = viewAs !== "self";

  const NavGroup = ({ label, links }: { label: string; links: [string, string][] }) => (
    <>
      <div className="nav-section">{label}</div>
      {links.map(([href, text]) => (
        <Link
          key={href}
          href={href}
          className="navlink"
          aria-current={pathname === href || (href !== "/admin" && href !== "/dashboard" && pathname.startsWith(href)) ? "page" : undefined}
        >
          {text}
        </Link>
      ))}
    </>
  );

  return (
    <div className={`shell${navOpen ? " nav-open" : ""}`}>
      <button
        type="button"
        className="nav-backdrop"
        aria-label="Close navigation menu"
        onClick={() => setNavOpen(false)}
        tabIndex={navOpen ? 0 : -1}
      />
      <nav id="primary-nav" className="sidebar" aria-label="Primary">
        <div className="sidebar-head">
          <Link href="/dashboard" className="brand">
            <span className="brand-mark" aria-hidden>{PRODUCT_MARK}</span>
            {PRODUCT_NAME}
          </Link>
          <button
            type="button"
            className="nav-close"
            aria-label="Close navigation menu"
            onClick={() => setNavOpen(false)}
          >
            ✕
          </button>
        </div>
        <div className="sidebar-scroll">
          <NavGroup label="Workspace" links={employeeLinks} />
          {manager && <NavGroup label="Manager" links={managerLinks} />}
          {(admin || manager) && <NavGroup label="Administration" links={adminLinks} />}
        </div>
        <div className="sidebar-foot">
          <div className="muted sidebar-user">
            {firstName(currentUser.displayName)}
            <br />
            <span className="sidebar-role">{primaryRole(currentUser)}</span>
          </div>
          <button className="button sm" style={{ width: "100%" }} onClick={signOut}>
            Sign out
          </button>
        </div>
      </nav>
      <div className="content">
        <header className="topbar">
          <div className="topbar-start">
            <button
              type="button"
              className="nav-toggle"
              aria-expanded={navOpen}
              aria-controls="primary-nav"
              aria-label={navOpen ? "Close navigation menu" : "Open navigation menu"}
              onClick={() => setNavOpen((open) => !open)}
            >
              <span className="nav-toggle-bar" aria-hidden />
              <span className="nav-toggle-bar" aria-hidden />
              <span className="nav-toggle-bar" aria-hidden />
            </button>
            <strong className="topbar-title">
              {primaryRole(currentUser) === "EMPLOYEE" ? "Employee workspace" : "Manager workspace"}
            </strong>
          </div>
          <div className="topbar-actions">
            {realAdmin && (
              <label className="viewas-select" title="Sample the site as a student or staff member">
                <span className="viewas-label muted">View as</span>
                <select
                  value={viewAs}
                  onChange={(e) => setViewAs(e.target.value as typeof viewAs)}
                  aria-label="View the site as"
                >
                  <option value="self">Admin (me)</option>
                  <option value="student">Student</option>
                  <option value="staff">Staff</option>
                </select>
              </label>
            )}
            <ThemeControls />
            <span className="badge info topbar-user-badge" aria-label={`Signed in as ${realUser.displayName}`}>
              {firstName(realUser.displayName)}
            </span>
          </div>
        </header>
        <main id="main">
          <TimeFormatSync>
            {viewingAs && (
              <div className="viewas-banner" role="status">
                <span>
                  👁 You are sampling the <strong>{viewAs === "student" ? "student" : "staff"}</strong> experience
                  {currentUser.displayName ? ` as ${currentUser.displayName}` : ""}.
                </span>
                <button className="button sm" onClick={() => setViewAs("self")}>Exit preview</button>
              </div>
            )}
            {children}
          </TimeFormatSync>
        </main>
      </div>
    </div>
  );
}
