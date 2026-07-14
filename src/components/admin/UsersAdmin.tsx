"use client";

import { useStore } from "@/lib/store/StoreProvider";
import { isAdmin, primaryRole } from "@/domain/scope";
import type { Role } from "@/domain/types";

const ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "SCHEDULER", "EMPLOYEE", "VIEWER", "AUDITOR"];

export function UsersAdmin() {
  const { db, currentUser, setUserState, setUserRoles } = useStore();
  const admin = isAdmin(currentUser);

  if (!admin) {
    return <div className="empty-state">Only super administrators can manage users.</div>;
  }

  const pending = db.users.filter((u) => u.state === "pending_approval" || u.state === "invited");
  const active = db.users.filter((u) => u.state !== "pending_approval" && u.state !== "invited");

  return (
    <div className="stack">
      <div className="page-head">
        <h1>User management</h1>
        <p className="muted">
          Approve access, change roles, and archive departing staff. Historical records are preserved —
          users are archived, never deleted.
        </p>
      </div>

      <section className="card">
        <h2>Awaiting approval ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="muted">No one is waiting for approval.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">State</th><th scope="col">Action</th></tr></thead>
              <tbody>
                {pending.map((u) => (
                  <tr key={u.id}>
                    <td>{u.displayName}</td>
                    <td>{u.email}</td>
                    <td><span className="badge warn">{u.state.replace("_", " ")}</span></td>
                    <td>
                      <div className="row">
                        <button className="button sm primary" onClick={() => setUserState(u.id, "active")}>Approve</button>
                        <button className="button sm danger" onClick={() => setUserState(u.id, "access_revoked")}>Deny</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>All users ({active.length})</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">State</th><th scope="col">Actions</th></tr>
            </thead>
            <tbody>
              {active.map((u) => (
                <tr key={u.id}>
                  <td>{u.displayName}</td>
                  <td>{u.email}</td>
                  <td>
                    <select
                      aria-label={`Primary role for ${u.displayName}`}
                      value={primaryRole(u)}
                      onChange={(e) => setUserRoles(u.id, [{ role: e.target.value as Role }])}
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td>
                    <span className={`badge ${u.state === "active" ? "ok" : u.state === "archived" ? "" : "warn"}`}>{u.state.replace("_", " ")}</span>
                  </td>
                  <td>
                    <div className="row">
                      {u.state === "active" ? (
                        <>
                          <button className="button sm" onClick={() => setUserState(u.id, "temporarily_inactive")}>Suspend</button>
                          <button className="button sm danger" onClick={() => setUserState(u.id, "archived")}>Archive</button>
                        </>
                      ) : (
                        <button className="button sm primary" onClick={() => setUserState(u.id, "active")}>Restore</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
