"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PRODUCT_NAME, PRODUCT_MARK, PRODUCT_TAGLINE } from "@/lib/config";
import { signInWithGoogle, isFirebaseConfigured } from "@/lib/firebase";
import { isApprovedDomain } from "@/lib/authz";
import { useStore } from "@/lib/store/StoreProvider";
import { ensureUserAccount } from "@/lib/store/firestore-users";
import { primaryRole } from "@/domain/scope";

export default function LoginPage() {
  const router = useRouter();
  const { db, signIn, isAuthenticated, hydrated } = useStore();
  const [status, setStatus] = useState<{ kind: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (hydrated && isAuthenticated) router.replace("/dashboard");
  }, [hydrated, isAuthenticated, router]);

  const activeUsers = db.users.filter((u) => u.state === "active");

  async function google() {
    setBusy(true);
    try {
      const r = await signInWithGoogle();
      const email = r.user.email ?? "";
      if (!isApprovedDomain(email)) {
        setStatus({ kind: "err", text: "This account is outside the approved Stanford domains." });
        return;
      }
      // Record this person so administrators can see them and assign access.
      // Bootstrap admins are provisioned active; everyone else starts pending.
      const account = await ensureUserAccount(r.user);
      if (account && account.state === "active") {
        signIn(account.id);
        router.replace("/dashboard");
      } else {
        setStatus({ kind: "warn", text: "Signed in, but your account needs administrator approval." });
        router.replace("/pending");
      }
    } catch (err) {
      // Surface the ACTUAL failure instead of always blaming configuration —
      // the most common real cause in production is an unauthorized deploy
      // domain, which the old catch-all message hid.
      const code =
        err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
      let text: string;
      switch (code) {
        case "auth/unauthorized-domain":
          text =
            "This site's domain isn't authorized for Google sign-in. An administrator must add it in Firebase Console → Authentication → Settings → Authorized domains.";
          break;
        case "auth/popup-blocked":
          text = "Your browser blocked the sign-in popup. Allow popups for this site and try again.";
          break;
        case "auth/popup-closed-by-user":
        case "auth/cancelled-popup-request":
          text = "Sign-in was cancelled. Please try again.";
          break;
        case "permission-denied":
          text =
            "Signed in, but your account record couldn't be created. Contact an administrator (Firestore rules may need to be deployed).";
          break;
        case "":
          text = "Google sign-in isn't available in this environment. Use an account below.";
          break;
        default:
          text = `Sign-in failed (${code}). Please try again or contact an administrator.`;
      }
      setStatus({ kind: "err", text });
      // eslint-disable-next-line no-console
      console.error("Google sign-in failed:", err);
    } finally {
      setBusy(false);
    }
  }

  function localSignIn(id: string) {
    signIn(id);
    router.replace("/dashboard");
  }

  return (
    <main id="main" style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: "1.5rem" }}>
      <section className="card pad-lg" style={{ maxWidth: 460, width: "100%" }}>
        <div className="brand" style={{ padding: 0, marginBottom: "1rem" }}>
          <span className="brand-mark" aria-hidden>{PRODUCT_MARK}</span>
          {PRODUCT_NAME}
        </div>
        <h1>Sign in</h1>
        <p className="muted">{PRODUCT_TAGLINE}</p>
        <p style={{ fontSize: "0.9rem" }}>
          Access is validated server-side for approved Stanford domains
          (<code>@stanford.edu</code>, <code>@law.stanford.edu</code>) plus a valid invitation or
          administrator approval.
        </p>

        <button className="button primary" onClick={google} disabled={busy} style={{ width: "100%" }}>
          {busy ? "Connecting…" : "Continue with Google"}
        </button>

        {status && (
          <p role="status" className={`mt badge ${status.kind}`} style={{ display: "inline-flex", whiteSpace: "normal" }}>
            {status.text}
          </p>
        )}

        {!isFirebaseConfigured && (
          <>
            <hr className="divider" />
            <h2 style={{ fontSize: "1rem" }}>Sign in as</h2>
            <p className="muted" style={{ fontSize: "0.82rem" }}>
              Google sign-in activates once Firebase is configured. Until then, sign in as an existing
              account:
            </p>
            <ul className="list-reset stack" style={{ gap: "0.4rem" }}>
              {activeUsers.map((u) => (
                <li key={u.id}>
                  <button className="button" style={{ width: "100%", justifyContent: "space-between" }} onClick={() => localSignIn(u.id)}>
                    <span>{u.displayName}</span>
                    <span className="badge">{primaryRole(u)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}
