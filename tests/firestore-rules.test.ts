import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { BOOTSTRAP_ADMINS } from "../src/lib/config";

const rules = readFileSync("firestore.rules", "utf8");

describe("firestore rules source", () => {
  it("blocks client audit writes", () => {
    expect(rules).toContain("match /organizations/{orgId}/auditEvents/{id}");
    expect(rules).toMatch(/auditEvents\/\{id\}\s*\{[\s\S]*?allow write: if false;/);
  });

  it("does not allow deletes for historical records", () => {
    expect(rules).toContain("allow delete: if false");
  });

  it("keeps user approval and role changes admin-only", () => {
    // The users block allows admin updates; approval/role edits are never self-serve.
    expect(rules).toMatch(/users\/\{userId\}\s*\{[\s\S]*?allow update: if isAdmin\(\);/);
  });

  it("lets a new signup self-register only a pending, role-less account", () => {
    expect(rules).toContain("request.resource.data.state == 'pending_approval'");
    expect(rules).toContain("request.resource.data.roles.size() == 0");
  });

  it("treats bootstrap admins as admins by verified email (break-glass)", () => {
    expect(rules).toContain("function isBootstrapAdmin()");
    expect(rules).toContain("request.auth.token.email_verified == true");
    expect(rules).toContain("request.auth.token.email.lower() in bootstrapAdminEmails()");
    expect(rules).toContain("function isAdmin() { return hasRole('SUPER_ADMIN') || isBootstrapAdmin(); }");
    // Every bootstrap email from config must appear so none can be locked out.
    for (const admin of BOOTSTRAP_ADMINS) {
      expect(rules).toContain(admin.email);
    }
  });

  it("keeps a default-deny catch-all", () => {
    expect(rules).toContain("match /{document=**} { allow read, write: if false; }");
  });

  it("keeps leave/exception reasons confidential to staff or the owner", () => {
    expect(rules).toContain("match /organizations/{orgId}/leaveRecords/{leaveId}");
    expect(rules).toContain("allow read: if isStaff() || resource.data.employeeId == request.auth.uid;");
  });

  it("restricts private manager notes to staff", () => {
    expect(rules).toContain("match /organizations/{orgId}/managerNotes/{noteId}");
    expect(rules).toContain("allow read, write: if isStaff();");
  });

  it("lets any signed-in user read only PUBLISHED daily notes", () => {
    expect(rules).toContain("match /organizations/{orgId}/dailyNotes/{noteId}");
    expect(rules).toContain("allow read: if isStaff() || (signedIn() && resource.data.published == true);");
  });

  it("reserves publishing/unpublishing daily notes to admins", () => {
    // Non-admin managers may edit their own note but may not flip `published`.
    expect(rules).toContain("(isManager() && resource.data.authorId == request.auth.uid && unchanged('published'));");
  });
});
