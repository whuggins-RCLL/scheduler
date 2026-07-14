"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PRODUCT_NAME } from "@/lib/config";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage, isAdmin, primaryRole } from "@/domain/scope";
import { ThemeControls } from "./ThemeControls";
import type { ReactNode } from "react";

const employeeLinks: [string, string][] = [
  ["/dashboard", "Dashboard"],
  ["/schedule", "Schedule"],
  ["/availability", "Availability"],
  ["/leave", "Leave"],
  ["/swaps", "Swaps"],
  ["/tasks", "Tasks"],
];

const managerLinks: [string, string][] = [
  ["/team", "Team"],
  ["/reports", "Reports"],
];

const adminLinks: [string, string][] = [
  ["/admin", "Overview"],
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
  const { currentUser, setCurrentUserId, db } = useStore();
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
          <span className="brand-mark" aria-hidden>CS</span>
          {PRODUCT_NAME}
        </Link>
        <NavGroup label="Workspace" links={employeeLinks} />
        {manager && <NavGroup label="Manager" links={managerLinks} />}
        {(admin || manager) && <NavGroup label="Administration" links={adminLinks} />}
        <div className="sidebar-foot">
          <label className="field" style={{ fontSize: "0.8rem" }}>
            <span className="hint">Preview as (demo)</span>
            <select
              value={currentUser.id}
              onChange={(e) => setCurrentUserId(e.target.value)}
              aria-label="Preview as user"
            >
              {db.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName} · {primaryRole(u)}
                </option>
              ))}
            </select>
          </label>
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
