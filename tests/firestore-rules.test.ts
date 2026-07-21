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
    // The users block allows admin updates. A person may self-serve only linking a
    // device (uid/email) to their own account — roles and state stay immutable.
    expect(rules).toMatch(/users\/\{userId\}\s*\{[\s\S]*?allow update: if isAdmin\(\)/);
    expect(rules).toContain("request.resource.data.roles == resource.data.roles");
    expect(rules).toContain("request.resource.data.state == resource.data.state");
    expect(rules).toContain("hasOnly(['uids', 'signInEmails', 'displayName', 'updatedAt'])");
  });

  it("lets a new signup self-register only a pending, role-less account", () => {
    expect(rules).toContain("request.resource.data.state == 'pending_approval'");
    expect(rules).toContain("request.resource.data.roles.size() == 0");
  });

  it("treats bootstrap admins as admins by verified email (break-glass)", () => {
    expect(rules).toContain("function isBootstrapAdmin()");
    expect(rules).toContain("request.auth.token.email_verified == true");
    // Bootstrap admins are matched by CANONICAL email so either Stanford login works.
    expect(rules).toContain("canonicalEmail() in bootstrapAdminEmails()");
    expect(rules).toContain("function isAdmin() { return hasRole('SUPER_ADMIN') || isBootstrapAdmin(); }");
    // Every bootstrap email from config (already canonical) must appear so none is locked out.
    for (const admin of BOOTSTRAP_ADMINS) {
      expect(rules).toContain(admin.email);
    }
  });

  it("keeps a default-deny catch-all", () => {
    expect(rules).toContain("match /{document=**} { allow read, write: if false; }");
  });

  it("lets only admins enqueue maintenance tasks, and never client updates", () => {
    expect(rules).toContain("match /organizations/{orgId}/maintenance/{taskId}");
    expect(rules).toMatch(
      /maintenance\/\{taskId\}\s*\{[\s\S]*?allow create: if isAdmin\(\);[\s\S]*?allow update, delete: if false;/,
    );
  });

  it("keeps leave/exception reasons confidential to staff or the owner", () => {
    expect(rules).toContain("match /organizations/{orgId}/leaveRecords/{leaveId}");
    expect(rules).toContain("allow read: if isStaff() || owns(resource.data.employeeId);");
  });

  it("keeps employee-profile creation staff-only", () => {
    expect(rules).toContain("match /organizations/{orgId}/employeeProfiles/{userId}");
    expect(rules).toMatch(
      /employeeProfiles\/\{userId\}\s*\{[\s\S]*?allow create: if isAdmin\(\) \|\| isManager\(\);/,
    );
  });

  it("lets a person self-serve only their own preference fields, never employment terms", () => {
    // Self-update is restricted to a display-preferences whitelist.
    expect(rules).toContain(
      "request.resource.data.diff(resource.data).affectedKeys()",
    );
    expect(rules).toContain("hasOnly(['preferredName', 'pronouns', 'notificationPrefs', 'updatedAt'])");
    // Staff retain full update rights.
    expect(rules).toMatch(
      /employeeProfiles\/\{userId\}\s*\{[\s\S]*?allow update: if isAdmin\(\) \|\| isManager\(\)/,
    );
  });

  it("does not let an employee reassign an availability record to another user", () => {
    // Ownership is by canonical account id (or legacy uid) via owns(); an update
    // may not change the record's employeeId.
    expect(rules).toContain("owns(resource.data.employeeId)");
    expect(rules).toContain("request.resource.data.employeeId == resource.data.employeeId");
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
    expect(rules).toContain("(isManager() && owns(resource.data.authorId) && unchanged('published'));");
  });
});
