/**
 * Tenant + access constants for the Cloud Functions codebase.
 *
 * These duplicate the values in `src/lib/config.ts` / `src/lib/authz.ts` because
 * the functions package is deployed in isolation and cannot import from the app
 * source tree. `tests/provision-config-sync.test.ts` asserts they stay in sync.
 */
export const ORGANIZATION_ID = "rcll";

export const APPROVED_EMAIL_DOMAINS = ["stanford.edu", "law.stanford.edu"];

export const BOOTSTRAP_ADMIN_EMAILS = [
  "whuggins@law.stanford.edu",
  "cadena@law.stanford.edu",
  "blalfaro@law.stanford.edu",
  "gwilson@stanford.edu",
  "bwilli@law.stanford.edu",
];

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isApprovedDomain(email: string): boolean {
  const e = normalizeEmail(email);
  return APPROVED_EMAIL_DOMAINS.some((d) => e.endsWith(`@${d}`));
}

export function isBootstrapAdminEmail(email: string): boolean {
  return BOOTSTRAP_ADMIN_EMAILS.includes(normalizeEmail(email));
}
