"use client";

import Link from "next/link";
import { useState } from "react";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/config";
import { signInWithGoogle } from "@/lib/firebase";
import { isApprovedDomain } from "@/lib/authz";

type Status = { kind: "idle" | "ok" | "denied" | "error"; text: string };

export default function LoginPage() {
  const [status, setStatus] = useState<Status>({ kind: "idle", text: "" });
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    try {
      const r = await signInWithGoogle();
      const email = r.user.email ?? "";
      if (isApprovedDomain(email)) {
        setStatus({ kind: "ok", text: "Signed in. Server-side domain validation and approval determine your destination." });
      } else {
        setStatus({ kind: "denied", text: "This account is outside the approved Stanford domains and cannot access the platform." });
      }
    } catch {
      setStatus({
        kind: "error",
        text: "Google sign-in is not available in this environment (Firebase not configured). Use the demo workspace below.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main id="main" style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: "1.5rem" }}>
      <section className="card pad-lg" style={{ maxWidth: 460 }}>
        <div className="brand" style={{ padding: 0, marginBottom: "1rem" }}>
          <span className="brand-mark" aria-hidden>CS</span>
          {PRODUCT_NAME}
        </div>
        <h1>Sign in</h1>
        <p className="muted">{PRODUCT_TAGLINE}</p>
        <p style={{ fontSize: "0.9rem" }}>
          Use your Stanford Google account. Access is validated server-side for approved domains
          (<code>@stanford.edu</code>, <code>@law.stanford.edu</code>) plus a valid invitation or administrator approval.
        </p>

        <button className="button primary" onClick={signIn} disabled={busy} style={{ width: "100%" }}>
          {busy ? "Connecting…" : "Continue with Google"}
        </button>

        {status.kind !== "idle" && (
          <p
            role="status"
            className={`mt badge ${status.kind === "ok" ? "ok" : status.kind === "denied" ? "err" : "warn"}`}
            style={{ display: "inline-flex", whiteSpace: "normal" }}
          >
            {status.text}
          </p>
        )}

        <hr className="divider" />
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Local demo mode: this build runs against an in-memory dataset with fictional staff so every
          workflow is explorable without live Firebase credentials.
        </p>
        <Link href="/dashboard" className="button" style={{ width: "100%" }}>
          Enter demo workspace
        </Link>
      </section>
    </main>
  );
}
