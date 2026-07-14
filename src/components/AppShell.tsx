"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { PRODUCT_NAME, PRODUCT_MARK } from "@/lib/config";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage, isAdmin, primaryRole } from "@/domain/scope";
import { ThemeControls } from "./ThemeControls";

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
  ["/leave", "Leave records"],
  ["/reports", "Reports"],
];

const adminLinks: [string, string][] = [
  ["/admin", "Overview"],
  ["/admin/preview", "View previews"],
  ["/admin/users", "Users"],
  ["/admin/invitations", "Invitations"],
  ["/admin/positions", "Positions"],
  ["/admin/tasks", "Tasks"],
  ["/admin/compliance", "Compliance"],
  ["/admin/integrations", "Integrations"],
  ["/admin/audit", "Audit log"],
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, isAuthenticated, hydrated, signOut } = useStore();

  useEffect(() => {
    if (hydrated && !isAuthenticated) router.replace("/login");
  }, [hydrated, isAuthenticated, router]);

  if (!hydrated) {
    return <main id="main" style={{ padding: "2rem" }} aria-busy="true"><p className="muted">Loading…</p></main>;
  }
  if (!isAuthenticated) {
    return <main id="main" style={{ padding: "2rem" }}><p className="muted">Redirecting to sign in…</p></main>;
  }

  const manager = canManage(currentUser);
  const admin = isAdmin(currentUser);

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
    <div className="shell">
      <nav className="sidebar" aria-label="Primary">
        <Link href="/dashboard" className="brand">
          <span className="brand-mark" aria-hidden>{PRODUCT_MARK}</span>
          {PRODUCT_NAME}
        </Link>
        <NavGroup label="Workspace" links={employeeLinks} />
        {manager && <NavGroup label="Manager" links={managerLinks} />}
        {(admin || manager) && <NavGroup label="Administration" links={adminLinks} />}
        <div className="sidebar-foot">
          <div className="muted" style={{ fontSize: "0.8rem", marginBottom: "0.4rem" }}>
            {currentUser.displayName}
            <br />
            <span style={{ fontSize: "0.72rem" }}>{primaryRole(currentUser)}</span>
          </div>
          <button className="button sm" style={{ width: "100%" }} onClick={signOut}>
            Sign out
          </button>
        </div>
      </nav>
      <div className="content">
        <header className="topbar">
          <strong style={{ color: "var(--muted)", fontWeight: 600, fontSize: "0.9rem" }}>
            {primaryRole(currentUser) === "EMPLOYEE" ? "Employee workspace" : "Manager workspace"}
          </strong>
          <div className="row">
            <ThemeControls />
            <span className="badge info" aria-label={`Signed in as ${currentUser.displayName}`}>
              {currentUser.displayName}
            </span>
          </div>
        </header>
        <main id="main">{children}</main>
      </div>
    </div>
  );
}
