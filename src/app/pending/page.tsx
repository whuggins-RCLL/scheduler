import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/config";

export const metadata = { title: "Pending approval" };

export default function PendingPage() {
  return (
    <main id="main" style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: "1.5rem" }}>
      <section className="card pad-lg" style={{ maxWidth: 480, textAlign: "center" }}>
        <span className="badge warn" style={{ margin: "0 auto 1rem" }}>Pending approval</span>
        <h1>Your {PRODUCT_NAME} access is under review</h1>
        <p className="muted">
          You&apos;re signed in with an approved Stanford account, but a platform administrator must approve
          your access or you must redeem a valid invitation before you can view schedules.
        </p>
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          You&apos;ll receive an email once your account is activated. If you were expecting immediate access,
          check that your invitation link hasn&apos;t expired.
        </p>
        <Link href="/login" className="button mt">Back to sign in</Link>
      </section>
    </main>
  );
}
