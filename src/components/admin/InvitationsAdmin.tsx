"use client";

import { useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { isAdmin } from "@/domain/scope";
import { humanDate } from "@/lib/ui";
import type { Invitation, Role } from "@/domain/types";

const ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "SCHEDULER", "EMPLOYEE", "VIEWER", "AUDITOR"];

function statusOf(inv: Invitation): { label: string; cls: string } {
  if (inv.revoked) return { label: "Revoked", cls: "err" };
  if (inv.redeemedAt) return { label: "Redeemed", cls: "ok" };
  if (new Date(inv.expiresAt).getTime() < Date.now()) return { label: "Expired", cls: "warn" };
  return { label: "Pending", cls: "info" };
}

function maskToken(token: string): string {
  return `••••${token.slice(-4)}`;
}

export function InvitationsAdmin() {
  const { db, currentUser } = useStore();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("EMPLOYEE");

  if (!isAdmin(currentUser)) {
    return <div className="empty-state">You do not have access to this section.</div>;
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Invitations</h1>
        <p className="muted">
          Signed, single-use, expiring invitation tokens. Tokens are masked here and never displayed in
          full.
        </p>
      </div>

      {db.invitations.length === 0 ? (
        <div className="empty-state">No invitations have been issued.</div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <caption>Issued invitations</caption>
            <thead>
              <tr>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Token</th>
                <th scope="col">Expires</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {db.invitations.map((inv) => {
                const s = statusOf(inv);
                return (
                  <tr key={inv.id}>
                    <td>{inv.email}</td>
                    <td>{inv.role}</td>
                    <td>
                      <code>{maskToken(inv.token)}</code>
                    </td>
                    <td>{humanDate(inv.expiresAt.slice(0, 10))}</td>
                    <td>
                      <span className={`badge ${s.cls}`}>{s.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <section className="card">
        <h2>Invite a user</h2>
        <p className="muted">
          Invitations use signed, single-use, expiring tokens. Only approved Stanford domains
          (stanford.edu / law.stanford.edu) may be invited. Issuance happens server-side via a Cloud
          Function.
        </p>
        <form className="form mt" onSubmit={(e) => e.preventDefault()}>
          <div className="field">
            <label htmlFor="invite-email">Email</label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="person@law.stanford.edu"
            />
          </div>
          <div className="field">
            <label htmlFor="invite-role">Role</label>
            <select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <button
              type="submit"
              className="button primary"
              disabled
              aria-label="Invite user — issuance happens server-side via a Cloud Function and is unavailable from the client"
              title="Issuance happens server-side via a Cloud Function"
            >
              Invite user
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
