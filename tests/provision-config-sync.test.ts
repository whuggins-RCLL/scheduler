import { describe, expect, it } from "vitest";
import {
  APPROVED_EMAIL_DOMAINS as FN_DOMAINS,
  BOOTSTRAP_ADMIN_EMAILS as FN_ADMINS,
  ORGANIZATION_ID as FN_ORG,
  isApprovedDomain,
  isBootstrapAdminEmail,
} from "../functions/src/provision";
import { APPROVED_EMAIL_DOMAINS, BOOTSTRAP_ADMINS, ORGANIZATION_ID } from "../src/lib/config";

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
    expect(isBootstrapAdminEmail("WHUGGINS@law.stanford.edu")).toBe(true);
    expect(isBootstrapAdminEmail("whuggins@stanford.edu")).toBe(false);
  });
});
