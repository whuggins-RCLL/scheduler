import { describe, expect, it } from "vitest";
import {
  APPROVED_EMAIL_DOMAINS as FN_DOMAINS,
  BOOTSTRAP_ADMIN_EMAILS as FN_ADMINS,
  ORGANIZATION_ID as FN_ORG,
  accountIdForEmail as fnAccountId,
  canonicalizeStanfordEmail as fnCanonical,
  isApprovedDomain,
  isBootstrapAdminEmail,
} from "../functions/src/provision";
import { APPROVED_EMAIL_DOMAINS, BOOTSTRAP_ADMINS, ORGANIZATION_ID, canonicalizeStanfordEmail } from "../src/lib/config";
import { accountIdForEmail } from "../src/lib/authz";

// The functions codebase deploys in isolation and re-declares these constants;
// this test guarantees they never drift from the app's source of truth.
describe("functions provision constants mirror src/lib/config", () => {
  it("organization id matches", () => {
    expect(FN_ORG).toBe(ORGANIZATION_ID);
  });

  it("approved domains match", () => {
    expect(new Set(FN_DOMAINS)).toEqual(new Set(APPROVED_EMAIL_DOMAINS));
  });

  it("bootstrap admin emails match", () => {
    expect(new Set(FN_ADMINS)).toEqual(new Set(BOOTSTRAP_ADMINS.map((a) => a.email)));
  });

  it("helpers behave like the app's authz checks", () => {
    expect(isApprovedDomain("Person@Stanford.edu")).toBe(true);
    expect(isApprovedDomain("person@law.stanford.edu")).toBe(true);
    expect(isApprovedDomain("person@gmail.com")).toBe(false);
    // Both Stanford logins now resolve to the same bootstrap admin.
    expect(isBootstrapAdminEmail("WHUGGINS@law.stanford.edu")).toBe(true);
    expect(isBootstrapAdminEmail("whuggins@stanford.edu")).toBe(true);
  });

  it("canonicalization + account id derivation match between functions and app", () => {
    for (const email of [
      "whuggins@law.stanford.edu",
      "whuggins@stanford.edu",
      "Person@Law.Stanford.Edu",
      "gwilson@stanford.edu",
    ]) {
      expect(fnCanonical(email)).toBe(canonicalizeStanfordEmail(email));
      expect(fnAccountId(email)).toBe(accountIdForEmail(email));
    }
  });
});
