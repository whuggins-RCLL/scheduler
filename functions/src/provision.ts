/**
 * Tenant + access constants for the Cloud Functions codebase.
 *
 * These duplicate the values in `src/lib/config.ts` / `src/lib/authz.ts` because
 * the functions package is deployed in isolation and cannot import from the app
 * source tree. `tests/provision-config-sync.test.ts` asserts they stay in sync.
 */
export const ORGANIZATION_ID = "rcll";

export const APPROVED_EMAIL_DOMAINS = ["stanford.edu", "law.stanford.edu"];

export const CANONICAL_EMAIL_DOMAIN = "stanford.edu";

// Canonical (@stanford.edu) forms — see canonicalizeStanfordEmail below.
export const BOOTSTRAP_ADMIN_EMAILS = [
  "whuggins@stanford.edu",
  "cadena@stanford.edu",
  "blalfaro@stanford.edu",
  "gwilson@stanford.edu",
  "bwilli@stanford.edu",
];

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Mirror of src/lib/config.ts canonicalizeStanfordEmail — keep in sync. */
export function canonicalizeStanfordEmail(email: string): string {
  const e = normalizeEmail(email);
  const at = e.lastIndexOf("@");
  if (at < 0) return e;
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (domain === CANONICAL_EMAIL_DOMAIN || domain.endsWith(`.${CANONICAL_EMAIL_DOMAIN}`)) {
    return `${local}@${CANONICAL_EMAIL_DOMAIN}`;
  }
  return e;
}

/** The shared account id for an email (mirror of authz.accountIdForEmail). */
export function accountIdForEmail(email: string): string {
  return canonicalizeStanfordEmail(email);
}

export function isApprovedDomain(email: string): boolean {
  const e = normalizeEmail(email);
  return APPROVED_EMAIL_DOMAINS.some((d) => e.endsWith(`@${d}`));
}

export function isBootstrapAdminEmail(email: string): boolean {
  return BOOTSTRAP_ADMIN_EMAILS.includes(canonicalizeStanfordEmail(email));
}
