import { describe, expect, it } from "vitest";
import {
  accountIdForEmail,
  canAccessApp,
  canonicalEmail,
  isApprovedDomain,
  isBootstrapAdmin,
  normalizeEmail,
} from "../src/lib/authz";

describe("authorization helpers", () => {
  it("normalizes email", () =>
    expect(normalizeEmail("  WHuggins@LAW.Stanford.edu ")).toBe("whuggins@law.stanford.edu"));
  it("allows only approved domains", () => {
    expect(isApprovedDomain("a@stanford.edu")).toBe(true);
    expect(isApprovedDomain("a@law.stanford.edu")).toBe(true);
    expect(isApprovedDomain("a@example.edu")).toBe(false);
  });
  it("recognizes bootstrap administrators by either Stanford login", () => {
    expect(isBootstrapAdmin("WHUGGINS@law.stanford.edu")).toBe(true);
    // The same person on the university-wide domain is the same admin.
    expect(isBootstrapAdmin("whuggins@stanford.edu")).toBe(true);
  });
  it("requires domain plus approval or invitation except bootstrap admins", () => {
    expect(canAccessApp({ email: "person@stanford.edu", state: "pending_approval" })).toBe(false);
    expect(canAccessApp({ email: "person@stanford.edu", invitationValid: true })).toBe(true);
    expect(canAccessApp({ email: "whuggins@law.stanford.edu" })).toBe(true);
    expect(canAccessApp({ email: "person@example.edu", state: "active" })).toBe(false);
  });
});

describe("canonical Stanford identity", () => {
  it("folds any *.stanford.edu sub-domain to one canonical email", () => {
    expect(canonicalEmail("whuggins@law.stanford.edu")).toBe("whuggins@stanford.edu");
    expect(canonicalEmail("WHuggins@Law.Stanford.edu")).toBe("whuggins@stanford.edu");
    expect(canonicalEmail("whuggins@stanford.edu")).toBe("whuggins@stanford.edu");
    expect(canonicalEmail("dept@med.stanford.edu")).toBe("dept@stanford.edu");
  });
  it("leaves non-Stanford emails alone (lower-cased)", () => {
    expect(canonicalEmail("Person@Example.edu")).toBe("person@example.edu");
  });
  it("maps both logins of one person to the same account id", () => {
    expect(accountIdForEmail("whuggins@law.stanford.edu")).toBe(
      accountIdForEmail("whuggins@stanford.edu"),
    );
    expect(accountIdForEmail("whuggins@law.stanford.edu")).toBe("whuggins@stanford.edu");
  });
  it("keeps different SUNet IDs distinct", () => {
    expect(accountIdForEmail("a@law.stanford.edu")).not.toBe(accountIdForEmail("b@stanford.edu"));
  });
});
